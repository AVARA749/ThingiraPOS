const express = require('express');
const { getOne, getAll, query, getDatabase } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/shifts/status - Check if a shift is open
router.get('/status', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const userId = req.user.id;

        const shift = await getOne(`
            SELECT * FROM shift_registers 
            WHERE shop_id = $1 AND user_id = $2 AND status = 'open'
            ORDER BY start_time DESC LIMIT 1
        `, [shopId, userId]);

        res.json({ isOpen: !!shift, shift });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check shift status.' });
    }
});

// POST /api/shifts/open - Start a new shift
router.post('/open', async (req, res) => {
    try {
        const { start_cash, notes } = req.body;
        const shopId = req.user.shop_id;
        const userId = req.user.id;

        // Check if already open
        const existing = await getOne(`SELECT id FROM shift_registers WHERE shop_id = $1 AND user_id = $2 AND status = 'open'`, [shopId, userId]);
        if (existing) {
            return res.status(400).json({ error: 'You already have an open shift.' });
        }

        const result = await query(`
            INSERT INTO shift_registers (shop_id, user_id, start_cash, notes, status)
            VALUES ($1, $2, $3, $4, 'open')
            RETURNING *
        `, [shopId, userId, start_cash || 0, notes || '']);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Shift open error:', err);
        res.status(500).json({ error: 'Failed to open shift.' });
    }
});

// POST /api/shifts/close - Close shift and calculate variance
router.post('/close', async (req, res) => {
    let client;
    try {
        const { actual_cash, notes } = req.body;
        const shopId = req.user.shop_id;
        const userId = req.user.id;

        const pool = getDatabase();
        client = await pool.connect();

        const shiftRes = await client.query(`
            SELECT * FROM shift_registers 
            WHERE shop_id = $1 AND user_id = $2 AND status = 'open'
            ORDER BY start_time DESC LIMIT 1
        `, [shopId, userId]);

        const shift = shiftRes.rows[0];
        if (!shift) {
            client.release();
            return res.status(404).json({ error: 'No open shift found.' });
        }

        await client.query('BEGIN');

        // Calculate expected cash from sales during this shift
        // Only CASH sales contribute to physical cash (Mpesa/Credit/Sacco are digital/receivable)
        const salesRes = await client.query(`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM sales 
            WHERE shop_id = $1 AND created_at >= $2 AND payment_type = 'cash' AND status = 'completed'
        `, [shopId, shift.start_time]);

        const cashSales = parseFloat(salesRes.rows[0].total);
        const expectedCash = parseFloat(shift.start_cash) + cashSales;
        const variance = parseFloat(actual_cash) - expectedCash;

        await client.query(`
            UPDATE shift_registers 
            SET end_time = CURRENT_TIMESTAMP, 
                expected_cash = $1, 
                actual_cash = $2, 
                variance = $3, 
                status = 'closed', 
                notes = COALESCE($4, notes)
            WHERE id = $5
        `, [expectedCash, actual_cash, variance, notes, shift.id]);

        await client.query('COMMIT');

        const closedShift = await getOne('SELECT * FROM shift_registers WHERE id = $1', [shift.id]);
        res.json(closedShift);
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Shift close error:', err);
        res.status(500).json({ error: 'Failed to close shift.' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/shifts/history
router.get('/history', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const shifts = await getAll(`
            SELECT sr.*, u.full_name as user_name
            FROM shift_registers sr
            JOIN users u ON sr.user_id = u.id
            WHERE sr.shop_id = $1
            ORDER BY sr.start_time DESC
            LIMIT 100
        `, [shopId]);
        res.json(shifts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch shift history.' });
    }
});

module.exports = router;
