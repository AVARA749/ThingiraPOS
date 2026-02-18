const express = require('express');
const { getOne, getAll, query } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/suppliers
router.get('/', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const suppliers = await getAll(`
      SELECT s.*, COUNT(DISTINCT i.id) as item_count
      FROM suppliers s
      LEFT JOIN items i ON s.id = i.supplier_id AND i.shop_id = $1
      WHERE s.shop_id = $1
      GROUP BY s.id
      ORDER BY s.name
    `, [shopId]);
        res.json(suppliers.map(s => ({
            ...s,
            item_count: parseInt(s.item_count)
        })));
    } catch (err) {
        console.error('Suppliers fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch suppliers.' });
    }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
    try {
        const supplier = await getOne('SELECT * FROM suppliers WHERE id = $1 AND shop_id = $2', [req.params.id, req.user.shop_id]);
        if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });
        res.json(supplier);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch supplier.' });
    }
});

// GET /api/suppliers/:id/purchases
router.get('/:id/purchases', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const purchases = await getAll(`
      SELECT p.*, i.name as item_name
      FROM purchases p
      JOIN items i ON p.item_id = i.id
      WHERE p.supplier_id = $1 AND p.shop_id = $2
      ORDER BY p.date_purchased DESC
    `, [req.params.id, shopId]);
        res.json(purchases.map(p => ({
            ...p,
            buying_price: parseFloat(p.buying_price),
            total_cost: parseFloat(p.total_cost),
            quantity: parseInt(p.quantity)
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch supplier purchases.' });
    }
});

// POST /api/suppliers
router.post('/', async (req, res) => {
    try {
        const { name, address, phone, email } = req.body;
        const shopId = req.user.shop_id;
        if (!name) return res.status(400).json({ error: 'Supplier name is required.' });

        const result = await query(`
      INSERT INTO suppliers (shop_id, name, address, phone, email) VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [shopId, name, address || '', phone || '', email || '']);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create supplier.' });
    }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req, res) => {
    try {
        const { name, address, phone, email } = req.body;
        const shopId = req.user.shop_id;

        await query(`
      UPDATE suppliers SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND shop_id = $6
    `, [name, address, phone, email, req.params.id, shopId]);

        const supplier = await getOne('SELECT * FROM suppliers WHERE id = $1 AND shop_id = $2', [req.params.id, shopId]);
        res.json(supplier);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update supplier.' });
    }
});

module.exports = router;
