const express = require('express');
const { getOne, getAll, query } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken);

function getDateFilter(period, from, to) {
    const conditions = [];
    const params = [];
    const today = new Date().toISOString().split('T')[0];
    if (period === 'today') { conditions.push(`created_at::date = $PARAMETER_INDEX$`); params.push(today); }
    else if (period === 'week') { conditions.push(`created_at::date >= $PARAMETER_INDEX$`); params.push(new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]); }
    else if (period === 'month') { conditions.push(`created_at::date >= $PARAMETER_INDEX$`); params.push(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]); }
    else {
        if (from) { conditions.push(`created_at::date >= $PARAMETER_INDEX$`); params.push(from); }
        if (to) { conditions.push(`created_at::date <= $PARAMETER_INDEX$`); params.push(to); }
    }
    return { conditions, params };
}

// Helper to fix parameter indices in conditions
function finalizeFilter(filter, baseIndex = 1) {
    let currentIndex = baseIndex;
    const finalConditions = filter.conditions.map(c => {
        const res = c.replace('$PARAMETER_INDEX$', `$${currentIndex}`);
        currentIndex++;
        return res;
    });
    return { conditions: finalConditions, params: filter.params };
}

router.get('/movements', async (req, res) => {
    try {
        const { type, from, to, period } = req.query;
        const shopId = req.user.shop_id;
        let sql = `SELECT * FROM stock_movements WHERE shop_id = $1`;
        const params = [shopId];
        const conds = [];

        if (type) {
            params.push(type);
            conds.push(`movement_type = $${params.length}`);
        }

        const df = getDateFilter(period, from, to);
        const finalDf = finalizeFilter(df, params.length + 1);
        conds.push(...finalDf.conditions);
        params.push(...finalDf.params);

        if (conds.length) sql += ' AND ' + conds.join(' AND ');
        sql += ' ORDER BY created_at DESC LIMIT 500';

        const movements = await getAll(sql, params);
        res.json(movements.map(m => ({
            ...m,
            quantity: parseInt(m.quantity),
            balance_after: parseInt(m.balance_after)
        })));
    } catch (err) {
        console.error('Movements error:', err);
        res.status(500).json({ error: 'Failed to fetch movements.' });
    }
});

router.get('/in', async (req, res) => {
    try {
        const { from, to, period } = req.query;
        const shopId = req.user.shop_id;
        let sql = `SELECT * FROM stock_movements WHERE movement_type = 'IN' AND shop_id = $1`;
        const params = [shopId];
        const df = getDateFilter(period, from, to);
        const finalDf = finalizeFilter(df, 2);

        if (finalDf.conditions.length) {
            sql += ' AND ' + finalDf.conditions.join(' AND ');
            params.push(...finalDf.params);
        }
        sql += ' ORDER BY created_at DESC';

        const movements = await getAll(sql, params);
        res.json(movements);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch stock in.' }); }
});

router.get('/out', async (req, res) => {
    try {
        const { from, to, period } = req.query;
        const shopId = req.user.shop_id;
        let sql = `SELECT * FROM stock_movements WHERE movement_type IN ('OUT','RETURN') AND shop_id = $1`;
        const params = [shopId];
        const df = getDateFilter(period, from, to);
        const finalDf = finalizeFilter(df, 2);

        if (finalDf.conditions.length) {
            sql += ' AND ' + finalDf.conditions.join(' AND ');
            params.push(...finalDf.params);
        }
        sql += ' ORDER BY created_at DESC';

        const movements = await getAll(sql, params);
        res.json(movements);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch stock out.' }); }
});

router.get('/current', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const items = await getAll(`
            SELECT id, name, quantity, min_stock_level, buying_price, selling_price, 
            (quantity*selling_price) as value_selling, (quantity*buying_price) as value_cost, 
            CASE WHEN quantity<=0 THEN 'OUT' WHEN quantity<=min_stock_level THEN 'LOW' ELSE 'OK' END as status 
            FROM items 
            WHERE shop_id = $1
            ORDER BY CASE WHEN quantity<=0 THEN 0 WHEN quantity<=min_stock_level THEN 1 ELSE 2 END, name
        `, [shopId]);

        const summary = await getOne(`
            SELECT COUNT(*)::INTEGER as total_items, SUM(quantity)::INTEGER as total_units, 
            SUM(quantity*selling_price)::NUMERIC as total_value_selling, 
            SUM(quantity*buying_price)::NUMERIC as total_value_cost, 
            SUM(CASE WHEN quantity<=0 THEN 1 ELSE 0 END)::INTEGER as out_of_stock, 
            SUM(CASE WHEN quantity>0 AND quantity<=min_stock_level THEN 1 ELSE 0 END)::INTEGER as low_stock 
            FROM items
            WHERE shop_id = $1
        `, [shopId]);

        res.json({
            items: items.map(i => ({
                ...i,
                quantity: parseInt(i.quantity),
                buying_price: parseFloat(i.buying_price),
                selling_price: parseFloat(i.selling_price),
                value_selling: parseFloat(i.value_selling),
                value_cost: parseFloat(i.value_cost)
            })),
            summary: {
                ...summary,
                total_value_selling: parseFloat(summary.total_value_selling || 0),
                total_value_cost: parseFloat(summary.total_value_cost || 0)
            }
        });
    } catch (err) {
        console.error('Current stock error:', err);
        res.status(500).json({ error: 'Failed to fetch current stock.' });
    }
});

module.exports = router;
