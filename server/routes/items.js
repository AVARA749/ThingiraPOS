const express = require('express');
const { getOne, getAll, query } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/items - List all items (with optional search)
router.get('/', async (req, res) => {
    try {
        const { q, category, low_stock } = req.query;
        const shopId = req.user.shop_id;

        let sql = `
      SELECT i.*, s.name as supplier_name
      FROM items i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.shop_id = $1
    `;
        const conditions = [];
        const params = [shopId];

        if (q) {
            params.push(`%${q}%`);
            const pIndex = params.length;
            conditions.push(`(i.name ILIKE $${pIndex} OR i.category ILIKE $${pIndex} OR i.barcode ILIKE $${pIndex})`);
        }
        if (category) {
            params.push(category);
            conditions.push(`i.category = $${params.length}`);
        }
        if (low_stock === 'true') {
            conditions.push(`i.quantity <= i.min_stock_level`);
        }

        if (conditions.length > 0) {
            sql += ' AND ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY i.name ASC';

        const items = await getAll(sql, params);
        res.json(items.map(i => ({
            ...i,
            buying_price: parseFloat(i.buying_price),
            selling_price: parseFloat(i.selling_price),
            quantity: parseInt(i.quantity)
        })));
    } catch (err) {
        console.error('Items list error:', err);
        res.status(500).json({ error: 'Failed to fetch items.' });
    }
});

// GET /api/items/categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await getAll(`SELECT DISTINCT category FROM items WHERE shop_id = $1 ORDER BY category`, [req.user.shop_id]);
        res.json(categories.map(c => c.category));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories.' });
    }
});

// GET /api/items/:id
router.get('/:id', async (req, res) => {
    try {
        const item = await getOne(`
      SELECT i.*, s.name as supplier_name
      FROM items i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1 AND i.shop_id = $2
    `, [req.params.id, req.user.shop_id]);

        if (!item) return res.status(404).json({ error: 'Item not found.' });
        res.json({
            ...item,
            buying_price: parseFloat(item.buying_price),
            selling_price: parseFloat(item.selling_price),
            quantity: parseInt(item.quantity)
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch item.' });
    }
});

// POST /api/items - Create a new item
router.post('/', async (req, res) => {
    try {
        const { name, buying_price, selling_price, quantity, min_stock_level, supplier_id, category, barcode } = req.body;
        const shopId = req.user.shop_id;

        if (!name || buying_price === undefined || selling_price === undefined) {
            return res.status(400).json({ error: 'Name, buying price, and selling price are required.' });
        }

        // Check duplicate name in THIS shop
        const existing = await getOne(`SELECT id FROM items WHERE LOWER(name) = LOWER($1) AND shop_id = $2`, [name, shopId]);
        if (existing) {
            return res.status(409).json({ error: 'An item with this name already exists in your shop.' });
        }

        const result = await query(`
      INSERT INTO items (shop_id, name, buying_price, selling_price, quantity, min_stock_level, supplier_id, category, barcode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [shopId, name, buying_price, selling_price, quantity || 0, min_stock_level || 5, supplier_id || null, category || 'Others', barcode || null]);

        const item = result.rows[0];

        // Log stock movement if initial quantity > 0
        if (quantity > 0) {
            await query(`
        INSERT INTO stock_movements (shop_id, item_id, item_name, movement_type, quantity, balance_after, reference_type, notes)
        VALUES ($1, $2, $3, 'IN', $4, $5, 'purchase', 'Initial stock entry')
      `, [shopId, item.id, name, quantity, quantity]);
        }

        res.status(201).json({
            ...item,
            buying_price: parseFloat(item.buying_price),
            selling_price: parseFloat(item.selling_price),
            quantity: parseInt(item.quantity)
        });
    } catch (err) {
        console.error('Item create error:', err);
        res.status(500).json({ error: 'Failed to create item.' });
    }
});

// PUT /api/items/:id - Update an item
router.put('/:id', async (req, res) => {
    try {
        const { name, buying_price, selling_price, quantity, min_stock_level, supplier_id, category, barcode } = req.body;
        const itemId = req.params.id;
        const shopId = req.user.shop_id;

        const existing = await getOne('SELECT * FROM items WHERE id = $1 AND shop_id = $2', [itemId, shopId]);
        if (!existing) return res.status(404).json({ error: 'Item not found.' });

        // Check duplicate name (excluding current item)
        if (name) {
            const duplicate = await getOne(`SELECT id FROM items WHERE LOWER(name) = LOWER($1) AND id != $2 AND shop_id = $3`, [name, itemId, shopId]);
            if (duplicate) {
                return res.status(409).json({ error: 'An item with this name already exists.' });
            }
        }

        const currentQty = parseInt(existing.quantity);
        const newQty = quantity !== undefined ? parseInt(quantity) : currentQty;
        const qtyDiff = newQty - currentQty;

        await query(`
      UPDATE items SET
        name = COALESCE($1, name),
        buying_price = COALESCE($2, buying_price),
        selling_price = COALESCE($3, selling_price),
        quantity = COALESCE($4, quantity),
        min_stock_level = COALESCE($5, min_stock_level),
        supplier_id = COALESCE($6, supplier_id),
        category = COALESCE($7, category),
        barcode = COALESCE($8, barcode),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND shop_id = $10
    `, [name, buying_price, selling_price, quantity, min_stock_level, supplier_id, category, barcode, itemId, shopId]);

        // Log stock adjustment if quantity changed
        if (qtyDiff !== 0) {
            await query(`
        INSERT INTO stock_movements (shop_id, item_id, item_name, movement_type, quantity, balance_after, reference_type, notes)
        VALUES ($1, $2, $3, $4, $5, $6, 'adjustment', 'Manual stock adjustment')
      `, [
                shopId,
                itemId,
                name || existing.name,
                qtyDiff > 0 ? 'IN' : 'OUT',
                Math.abs(qtyDiff),
                newQty,
            ]);
        }

        const updated = await getOne('SELECT * FROM items WHERE id = $1 AND shop_id = $2', [itemId, shopId]);
        res.json({
            ...updated,
            buying_price: parseFloat(updated.buying_price),
            selling_price: parseFloat(updated.selling_price),
            quantity: parseInt(updated.quantity)
        });
    } catch (err) {
        console.error('Item update error:', err);
        res.status(500).json({ error: 'Failed to update item.' });
    }
});

// DELETE /api/items/:id
router.delete('/:id', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const item = await getOne('SELECT * FROM items WHERE id = $1 AND shop_id = $2', [req.params.id, shopId]);
        if (!item) return res.status(404).json({ error: 'Item not found.' });

        // Check if item has sales
        const hasSales = await getOne('SELECT COUNT(*) as c FROM sale_items WHERE item_id = $1 AND shop_id = $2', [req.params.id, shopId]);
        if (parseInt(hasSales.c) > 0) {
            return res.status(400).json({ error: 'Cannot delete item with existing sales records. Consider zeroing the stock instead.' });
        }

        await query('DELETE FROM stock_movements WHERE item_id = $1 AND shop_id = $2', [req.params.id, shopId]);
        await query('DELETE FROM purchases WHERE item_id = $1 AND shop_id = $2', [req.params.id, shopId]);
        await query('DELETE FROM items WHERE id = $1 AND shop_id = $2', [req.params.id, shopId]);

        res.json({ message: 'Item deleted successfully.' });
    } catch (err) {
        console.error('Item delete error:', err);
        res.status(500).json({ error: 'Failed to delete item.' });
    }
});

module.exports = router;
