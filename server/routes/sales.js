const express = require('express');
const { getOne, getAll, query, getDatabase } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Generate receipt number
async function generateReceiptNumber(shopId) {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const last = await getOne(`
    SELECT receipt_number FROM sales
    WHERE shop_id = $1 AND receipt_number LIKE $2
    ORDER BY id DESC LIMIT 1
  `, [shopId, `TS-${today}%`]);

    let num = 1;
    if (last) {
        const parts = last.receipt_number.split('-');
        if (parts.length >= 3) {
            num = parseInt(parts[2]) + 1;
        }
    }
    return `TS-${today}-${String(num).padStart(4, '0')}`;
}

// POST /api/sales - Create a new sale
router.post('/', async (req, res) => {
    let client;
    const shopId = req.user.shop_id;
    try {
        const pool = getDatabase();
        client = await pool.connect();
        await client.query('BEGIN');

        const { items: saleItems, customer_name, customer_phone, payment_type, notes } = req.body;

        if (!saleItems || saleItems.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'At least one item is required.' });
        }

        if (!payment_type || !['cash', 'credit', 'mpesa', 'sacco'].includes(payment_type)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Payment type must be cash, credit, mpesa, or sacco.' });
        }

        // Validate stock availability
        for (const si of saleItems) {
            const itemRes = await client.query('SELECT id, name, quantity, selling_price FROM items WHERE id = $1 AND shop_id = $2', [si.item_id, shopId]);
            const item = itemRes.rows[0];
            if (!item) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: `Item not found: ${si.item_id}` });
            }
            if (parseInt(item.quantity) < si.quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Insufficient stock for "${item.name}". Available: ${item.quantity}, Requested: ${si.quantity}`,
                });
            }
        }

        const receiptNumber = await generateReceiptNumber(shopId);

        // Handle customer
        let customerId = null;
        if (customer_name) {
            const existingRes = await client.query(`
                SELECT id FROM customers WHERE (LOWER(name) = LOWER($1) OR phone = $2) AND shop_id = $3
            `, [customer_name, customer_phone || '', shopId]);
            const existingCustomer = existingRes.rows[0];

            if (existingCustomer) {
                customerId = existingCustomer.id;
                if (customer_phone) {
                    await client.query('UPDATE customers SET phone = $1 WHERE id = $2 AND shop_id = $3', [customer_phone, customerId, shopId]);
                }
            } else {
                const result = await client.query(`INSERT INTO customers (shop_id, name, phone) VALUES ($1, $2, $3) RETURNING id`, [shopId, customer_name, customer_phone || '']);
                customerId = result.rows[0].id;
            }
        }

        // Calculate total
        let totalAmount = 0;
        const lineItems = [];
        for (const si of saleItems) {
            const itemRes = await client.query('SELECT * FROM items WHERE id = $1 AND shop_id = $2', [si.item_id, shopId]);
            const item = itemRes.rows[0];
            const unitPrice = parseFloat(si.unit_price || item.selling_price);
            const subtotal = unitPrice * si.quantity;
            totalAmount += subtotal;
            lineItems.push({
                ...si,
                item_name: item.name,
                unit_price: unitPrice,
                buying_price: parseFloat(item.buying_price),
                subtotal,
                item,
            });
        }

        // Insert sale
        const saleResult = await client.query(`
            INSERT INTO sales (shop_id, receipt_number, customer_id, customer_name, customer_phone, total_amount, payment_type, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [shopId, receiptNumber, customerId, customer_name || 'Walk-in Customer', customer_phone || '', totalAmount, payment_type, notes || '']);
        const saleId = saleResult.rows[0].id;

        // Insert line items & deduct stock
        for (const li of lineItems) {
            await client.query(`
                INSERT INTO sale_items (shop_id, sale_id, item_id, item_name, quantity, unit_price, buying_price, subtotal)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [shopId, saleId, li.item_id, li.item_name, li.quantity, li.unit_price, li.buying_price, li.subtotal]);

            // Deduct stock
            await client.query('UPDATE items SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND shop_id = $3', [li.quantity, li.item_id, shopId]);

            // Log stock movement
            const updateRes = await client.query('SELECT quantity FROM items WHERE id = $1 AND shop_id = $2', [li.item_id, shopId]);
            const updatedItem = updateRes.rows[0];
            await client.query(`
                INSERT INTO stock_movements (shop_id, item_id, item_name, movement_type, quantity, balance_after, reference_type, reference_id, notes)
                VALUES ($1, $2, $3, 'OUT', $4, $5, 'sale', $6, $7)
            `, [shopId, li.item_id, li.item_name, li.quantity, updatedItem.quantity, saleId, `Sale - ${receiptNumber}`]);

            // Ledger: COGS and Inventory
            const cogsAmount = li.buying_price * li.quantity;
            await client.query(`
                INSERT INTO general_ledger (shop_id, account_name, account_type, debit, credit, reference_type, reference_id, description)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8),
                       ($1, $9, $10, $11, $12, $6, $7, $8)
            `, [
                shopId, 'Cost of Goods Sold', 'Expense', cogsAmount, 0, 'sale', saleId, `COGS for ${li.item_name} (Receipt: ${receiptNumber})`,
                'Inventory', 'Asset', 0, cogsAmount
            ]);
        }

        // Ledger: Payment and Revenue
        const paymentAccount = payment_type === 'cash' ? 'Cash' :
            payment_type === 'mpesa' ? 'Mpesa' :
                payment_type === 'sacco' ? 'Sacco' : 'Accounts Receivable';

        await client.query(`
            INSERT INTO general_ledger (shop_id, account_name, account_type, debit, credit, reference_type, reference_id, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8),
                   ($1, $9, $10, $11, $12, $6, $7, $8)
        `, [
            shopId, paymentAccount, 'Asset', totalAmount, 0, 'sale', saleId, `Sale Revenue (Receipt: ${receiptNumber}, Method: ${payment_type})`,
            'Sales Revenue', 'Revenue', 0, totalAmount
        ]);

        // Handle credit sale
        if (payment_type === 'credit' && customerId) {
            await client.query(`
                INSERT INTO credit_ledger (shop_id, customer_id, customer_name, sale_id, amount, balance, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'unpaid')
            `, [shopId, customerId, customer_name, saleId, totalAmount, totalAmount]);

            await client.query('UPDATE customers SET total_credit = total_credit + $1 WHERE id = $2 AND shop_id = $3', [totalAmount, customerId, shopId]);
        }

        await client.query('COMMIT');

        const sale = await getOne('SELECT * FROM sales WHERE id = $1 AND shop_id = $2', [saleId, shopId]);
        const items = await getAll('SELECT * FROM sale_items WHERE sale_id = $1 AND shop_id = $2', [saleId, shopId]);

        res.status(201).json({
            sale: { ...sale, total_amount: parseFloat(sale.total_amount) },
            items: items.map(i => ({ ...i, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unit_price), subtotal: parseFloat(i.subtotal) })),
            receipt_number: receiptNumber
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Sale creation error:', err);
        res.status(500).json({ error: 'Failed to process sale.' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/sales
router.get('/', async (req, res) => {
    try {
        const { from, to, payment_type, status } = req.query;
        const shopId = req.user.shop_id;

        let sql = `
      SELECT s.*, COUNT(si.id)::INTEGER as item_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.shop_id = $1
    `;
        const conditions = [];
        const params = [shopId];

        if (from) {
            params.push(from);
            conditions.push(`s.created_at::date >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`s.created_at::date <= $${params.length}`);
        }
        if (payment_type) {
            params.push(payment_type);
            conditions.push(`s.payment_type = $${params.length}`);
        }
        if (status) {
            params.push(status);
            conditions.push(`s.status = $${params.length}`);
        }

        if (conditions.length > 0) sql += ' AND ' + conditions.join(' AND ');
        sql += ' GROUP BY s.id ORDER BY s.created_at DESC';

        const sales = await getAll(sql, params);
        res.json(sales.map(s => ({
            ...s,
            total_amount: parseFloat(s.total_amount)
        })));
    } catch (err) {
        console.error('Sales fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch sales.' });
    }
});

// GET /api/sales/:id
router.get('/:id', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const sale = await getOne('SELECT * FROM sales WHERE id = $1 AND shop_id = $2', [req.params.id, shopId]);
        if (!sale) return res.status(404).json({ error: 'Sale not found.' });

        const items = await getAll('SELECT * FROM sale_items WHERE sale_id = $1 AND shop_id = $2', [req.params.id, shopId]);
        res.json({
            sale: { ...sale, total_amount: parseFloat(sale.total_amount) },
            items: items.map(i => ({ ...i, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unit_price), subtotal: parseFloat(i.subtotal) }))
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sale.' });
    }
});

// DELETE /api/sales/:id - Void a sale (restore stock)
router.delete('/:id', async (req, res) => {
    let client;
    const shopId = req.user.shop_id;
    try {
        const pool = getDatabase();
        client = await pool.connect();
        await client.query('BEGIN');

        const saleRes = await client.query('SELECT * FROM sales WHERE id = $1 AND shop_id = $2', [req.params.id, shopId]);
        const sale = saleRes.rows[0];
        if (!sale) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sale not found.' });
        }
        if (sale.status === 'voided') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Sale already voided.' });
        }

        const lineItemsRes = await client.query('SELECT * FROM sale_items WHERE sale_id = $1 AND shop_id = $2', [req.params.id, shopId]);
        const saleItems = lineItemsRes.rows;

        // Restore stock for each item
        for (const si of saleItems) {
            await client.query('UPDATE items SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND shop_id = $3', [si.quantity, si.item_id, shopId]);

            const itemRes = await client.query('SELECT quantity FROM items WHERE id = $1 AND shop_id = $2', [si.item_id, shopId]);
            const updatedItem = itemRes.rows[0];
            await client.query(`
                INSERT INTO stock_movements (shop_id, item_id, item_name, movement_type, quantity, balance_after, reference_type, reference_id, notes)
                VALUES ($1, $2, $3, 'RETURN', $4, $5, 'delete_sale', $6, $7)
            `, [shopId, si.item_id, si.item_name, si.quantity, updatedItem.quantity, sale.id, `Voided sale - ${sale.receipt_number}`]);
        }

        // If credit sale, update credit ledger status to voided
        if (sale.payment_type === 'credit' && sale.customer_id) {
            const creditRes = await client.query('SELECT * FROM credit_ledger WHERE sale_id = $1 AND shop_id = $2', [sale.id, shopId]);
            const creditEntry = creditRes.rows[0];
            if (creditEntry) {
                // Return the credit amount to the customer's total balance
                await client.query('UPDATE customers SET total_credit = GREATEST(0, total_credit - $1) WHERE id = $2 AND shop_id = $3', [creditEntry.amount, sale.customer_id, shopId]);
                // Mark the entry as voided instead of deleting it (Audit Trail)
                await client.query("UPDATE credit_ledger SET status = 'voided', updated_at = CURRENT_TIMESTAMP WHERE sale_id = $1 AND shop_id = $2", [sale.id, shopId]);
            }
        }

        // --- ACCOUNTING REVERSAL (Double Entry) ---
        // 1. Reverse Revenue and Payment Asset
        const paymentAccount = sale.payment_type === 'cash' ? 'Cash' :
            sale.payment_type === 'mpesa' ? 'Mpesa' :
                sale.payment_type === 'sacco' ? 'Sacco' : 'Accounts Receivable';

        await client.query(`
            INSERT INTO general_ledger (shop_id, account_name, account_type, debit, credit, reference_type, reference_id, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8),
                   ($1, $9, $10, $11, $12, $6, $7, $8)
        `, [
            shopId, 'Sales Revenue', 'Revenue', sale.total_amount, 0, 'void', sale.id, `Sale Voided (Receipt: ${sale.receipt_number})`,
            paymentAccount, 'Asset', 0, sale.total_amount
        ]);

        // 2. Reverse COGS and Inventory for each item
        for (const si of saleItems) {
            const cogsAmount = parseFloat(si.buying_price) * parseInt(si.quantity);
            await client.query(`
                INSERT INTO general_ledger (shop_id, account_name, account_type, debit, credit, reference_type, reference_id, description)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8),
                       ($1, $9, $10, $11, $12, $6, $7, $8)
            `, [
                shopId, 'Inventory', 'Asset', cogsAmount, 0, 'void', sale.id, `Stock Restored from Void (Item: ${si.item_name})`,
                'Cost of Goods Sold', 'Expense', 0, cogsAmount
            ]);
        }

        // Mark sale as voided
        await client.query("UPDATE sales SET status = 'voided' WHERE id = $1 AND shop_id = $2", [req.params.id, shopId]);

        await client.query('COMMIT');
        res.json({ message: 'Sale voided successfully. Audit trail and reversing entries recorded.' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Sale delete error:', err);
        res.status(500).json({ error: 'Failed to void sale.' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
