const express = require('express');
const { getOne, getAll, query, getDatabase } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// POST /api/purchases - Record stock intake
router.post('/', async (req, res) => {
    let client;
    const shopId = req.user.shop_id;
    try {
        const { supplier_id, supplier_name, supplier_address, supplier_phone, items: purchaseItems } = req.body;

        if (!purchaseItems || purchaseItems.length === 0) {
            return res.status(400).json({ error: 'At least one item is required.' });
        }

        const pool = getDatabase();
        client = await pool.connect();
        await client.query('BEGIN');

        let suppId = supplier_id;

        // Create supplier if not exists in THIS shop
        if (!suppId && supplier_name) {
            const existingRes = await client.query(`SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) AND shop_id = $2`, [supplier_name, shopId]);
            const existing = existingRes.rows[0];
            if (existing) {
                suppId = existing.id;
                // Update supplier info
                await client.query(`UPDATE suppliers SET address = COALESCE($1, address), phone = COALESCE($2, phone) WHERE id = $3 AND shop_id = $4`,
                    [supplier_address, supplier_phone, suppId, shopId]);
            } else {
                const result = await client.query(`INSERT INTO suppliers (shop_id, name, address, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
                    [shopId, supplier_name, supplier_address || '', supplier_phone || '']);
                suppId = result.rows[0].id;
            }
        }

        if (!suppId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Supplier information is required.' });
        }

        const results = [];

        for (const pi of purchaseItems) {
            let itemId = pi.item_id;
            let itemName = pi.item_name;

            // Create item if new in THIS shop
            if (!itemId && itemName) {
                const existingItemRes = await client.query(`SELECT * FROM items WHERE LOWER(name) = LOWER($1) AND shop_id = $2`, [itemName, shopId]);
                const existingItem = existingItemRes.rows[0];
                if (existingItem) {
                    itemId = existingItem.id;
                    // Update prices and add to quantity
                    await client.query(`
                        UPDATE items SET
                        buying_price = $1,
                        selling_price = COALESCE($2, selling_price),
                        quantity = quantity + $3,
                        supplier_id = $4,
                        min_stock_level = COALESCE($5, min_stock_level),
                        updated_at = CURRENT_TIMESTAMP
                        WHERE id = $6 AND shop_id = $7
                    `, [pi.buying_price, pi.selling_price, pi.quantity, suppId, pi.min_stock_level, itemId, shopId]);
                } else {
                    const result = await client.query(`
                        INSERT INTO items (shop_id, name, buying_price, selling_price, quantity, min_stock_level, supplier_id, category)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        RETURNING id
                    `, [shopId, itemName, pi.buying_price, pi.selling_price || pi.buying_price * 1.3, pi.quantity, pi.min_stock_level || 5, suppId, pi.category || 'Others']);
                    itemId = result.rows[0].id;
                }
            } else if (itemId) {
                // Update existing item quantity in THIS shop
                const existingItemRes = await client.query('SELECT * FROM items WHERE id = $1 AND shop_id = $2', [itemId, shopId]);
                const existingItem = existingItemRes.rows[0];
                if (!existingItem) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: `Item not found: ${itemId}` });
                }
                itemName = existingItem.name;

                await client.query(`
                    UPDATE items SET
                    buying_price = $1,
                    selling_price = COALESCE($2, selling_price),
                    quantity = quantity + $3,
                    supplier_id = $4,
                    updated_at = CURRENT_TIMESTAMP
                    WHERE id = $5 AND shop_id = $6
                `, [pi.buying_price, pi.selling_price, pi.quantity, suppId, itemId, shopId]);
            }

            const totalCost = pi.buying_price * pi.quantity;
            const datePurchased = pi.date_purchased || new Date().toISOString().split('T')[0];

            const purchaseRes = await client.query(`
                INSERT INTO purchases (shop_id, supplier_id, item_id, quantity, buying_price, total_cost, date_purchased)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `, [shopId, suppId, itemId, pi.quantity, pi.buying_price, totalCost, datePurchased]);

            const purchaseId = purchaseRes.rows[0].id;

            // Get updated balance
            const updateRes = await client.query('SELECT quantity FROM items WHERE id = $1 AND shop_id = $2', [itemId, shopId]);
            const updatedItem = updateRes.rows[0];
            const suppRes = await client.query('SELECT name FROM suppliers WHERE id = $1 AND shop_id = $2', [suppId, shopId]);
            const supplierInfo = suppRes.rows[0];

            await client.query(`
                INSERT INTO stock_movements (shop_id, item_id, item_name, movement_type, quantity, balance_after, reference_type, reference_id, supplier_name, notes)
                VALUES ($1, $2, $3, 'IN', $4, $5, 'purchase', $6, $7, $8)
            `, [shopId, itemId, itemName, pi.quantity, updatedItem.quantity, purchaseId, supplierInfo.name, 'Stock purchase']);

            // Ledger: Inventory and Cash
            await client.query(`
                INSERT INTO general_ledger (shop_id, account_name, account_type, debit, credit, reference_type, reference_id, description)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8),
                       ($1, $9, $10, $11, $12, $6, $7, $8)
            `, [
                shopId, 'Inventory', 'Asset', totalCost, 0, 'purchase', purchaseId, `Purchase of ${itemName} from ${supplierInfo.name}`,
                'Cash', 'Asset', 0, totalCost
            ]);

            results.push({ item_id: itemId, item_name: itemName, quantity: pi.quantity, purchase_id: purchaseId });
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Stock intake recorded successfully.', purchases: results });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Purchase error:', err);
        res.status(500).json({ error: 'Failed to record stock purchase.' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/purchases
router.get('/', async (req, res) => {
    try {
        const { from, to, supplier_id } = req.query;
        const shopId = req.user.shop_id;

        let sql = `
      SELECT p.*, i.name as item_name, s.name as supplier_name
      FROM purchases p
      JOIN items i ON p.item_id = i.id
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.shop_id = $1
    `;
        const conditions = [];
        const params = [shopId];

        if (from) {
            params.push(from);
            conditions.push(`p.date_purchased >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`p.date_purchased <= $${params.length}`);
        }
        if (supplier_id) {
            params.push(supplier_id);
            conditions.push(`p.supplier_id = $${params.length}`);
        }

        if (conditions.length > 0) sql += ' AND ' + conditions.join(' AND ');
        sql += ' ORDER BY p.date_purchased DESC, p.created_at DESC';

        const purchases = await getAll(sql, params);
        res.json(purchases.map(p => ({
            ...p,
            buying_price: parseFloat(p.buying_price),
            total_cost: parseFloat(p.total_cost),
            quantity: parseInt(p.quantity)
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch purchases.' });
    }
});

module.exports = router;
