const express = require('express');
const { getOne, getAll, query, getDatabase } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/customers
router.get('/', async (req, res) => {
    try {
        const { q } = req.query;
        let sql = 'SELECT * FROM customers WHERE shop_id = $1';
        const params = [req.user.shop_id];

        if (q) {
            sql += ' AND (name ILIKE $2 OR phone ILIKE $2)';
            params.push(`%${q}%`);
        }
        sql += ' ORDER BY name';

        const customers = await getAll(sql, params);
        res.json(customers.map(c => ({
            ...c,
            total_credit: parseFloat(c.total_credit)
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch customers.' });
    }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
    try {
        const customer = await getOne('SELECT * FROM customers WHERE id = $1 AND shop_id = $2', [req.params.id, req.user.shop_id]);
        if (!customer) return res.status(404).json({ error: 'Customer not found.' });
        res.json({
            ...customer,
            total_credit: parseFloat(customer.total_credit)
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch customer.' });
    }
});

// GET /api/customers/:id/ledger
router.get('/:id/ledger', async (req, res) => {
    try {
        const ledger = await getAll(`
      SELECT cl.*, s.receipt_number
      FROM credit_ledger cl
      JOIN sales s ON cl.sale_id = s.id
      WHERE cl.customer_id = $1 AND cl.shop_id = $2
      ORDER BY cl.created_at DESC
    `, [req.params.id, req.user.shop_id]);
        res.json(ledger.map(l => ({
            ...l,
            amount: parseFloat(l.amount),
            paid_amount: parseFloat(l.paid_amount),
            balance: parseFloat(l.balance)
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch credit ledger.' });
    }
});

// POST /api/customers/:id/pay - Record credit payment
router.post('/:id/pay', async (req, res) => {
    let client;
    try {
        const { amount, ledger_id, payment_date, notes } = req.body;
        const payDate = payment_date || new Date().toISOString().split('T')[0];
        const shopId = req.user.shop_id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Payment amount must be greater than 0.' });
        }

        const pool = getDatabase();
        client = await pool.connect();

        const customerRes = await client.query('SELECT * FROM customers WHERE id = $1 AND shop_id = $2', [req.params.id, shopId]);
        const customer = customerRes.rows[0];
        if (!customer) {
            client.release();
            return res.status(404).json({ error: 'Customer not found.' });
        }

        // Start transaction
        await client.query('BEGIN');

        if (ledger_id) {
            // Pay specific credit entry
            const entryRes = await client.query('SELECT * FROM credit_ledger WHERE id = $1 AND customer_id = $2 AND shop_id = $3', [ledger_id, req.params.id, shopId]);
            const entry = entryRes.rows[0];
            if (!entry) throw new Error('Credit entry not found.');

            const newPaid = parseFloat(entry.paid_amount) + parseFloat(amount);
            const newBalance = Math.max(0, parseFloat(entry.amount) - newPaid);
            const newStatus = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

            await client.query(`
                UPDATE credit_ledger SET paid_amount = $1, balance = $2, status = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4 AND shop_id = $5
            `, [newPaid, newBalance, newStatus, ledger_id, shopId]);

            // Record payment event
            await client.query(`
                INSERT INTO credit_payments (shop_id, customer_id, ledger_id, amount, payment_date, notes)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [shopId, req.params.id, ledger_id, amount, payDate, notes || '']);
        } else {
            // General payment
            await client.query(`
                INSERT INTO credit_payments (shop_id, customer_id, amount, payment_date, notes)
                VALUES ($1, $2, $3, $4, $5)
            `, [shopId, req.params.id, amount, payDate, notes || 'Partial payment']);
        }

        // Update customer total credit
        await client.query('UPDATE customers SET total_credit = GREATEST(0, total_credit - $1) WHERE id = $2 AND shop_id = $3',
            [amount, req.params.id, shopId]);

        // Ledger: Payment Receipt
        await client.query(`
            INSERT INTO general_ledger (shop_id, account_name, account_type, debit, credit, reference_type, reference_id, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8),
                   ($1, $9, $10, $11, $12, $6, $7, $8)
        `, [
            shopId, 'Cash', 'Asset', amount, 0, 'payment', req.params.id, `Credit payment from ${customer.name}`,
            'Accounts Receivable', 'Asset', 0, amount
        ]);

        await client.query('COMMIT');

        const updatedRes = await client.query('SELECT * FROM customers WHERE id = $1 AND shop_id = $2', [req.params.id, shopId]);
        const updated = updatedRes.rows[0];

        res.json({
            message: 'Payment recorded successfully.',
            customer: { ...updated, total_credit: parseFloat(updated.total_credit) }
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Payment error:', err);
        res.status(500).json({ error: err.message || 'Failed to record payment.' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
