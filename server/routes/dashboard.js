const express = require('express');
const { getOne, getAll } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const shopId = req.user.shop_id;

    const totalSales = await getOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales WHERE created_at::date = $1 AND shop_id = $2 AND status = 'completed'
    `, [today, shopId]);

    const totalItemsSold = await getOne(`
      SELECT COALESCE(SUM(si.quantity), 0) as total
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.created_at::date = $1 AND s.shop_id = $2 AND s.status = 'completed'
    `, [today, shopId]);

    const cashSales = await getOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales WHERE created_at::date = $1 AND shop_id = $2 AND payment_type = 'cash' AND status = 'completed'
    `, [today, shopId]);

    const creditSales = await getOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales WHERE created_at::date = $1 AND shop_id = $2 AND payment_type = 'credit' AND status = 'completed'
    `, [today, shopId]);

    const mpesaSales = await getOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales WHERE created_at::date = $1 AND shop_id = $2 AND payment_type = 'mpesa' AND status = 'completed'
    `, [today, shopId]);

    const saccoSales = await getOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales WHERE created_at::date = $1 AND shop_id = $2 AND payment_type = 'sacco' AND status = 'completed'
    `, [today, shopId]);

    const transactionCount = await getOne(`
      SELECT COUNT(*) as total
      FROM sales WHERE created_at::date = $1 AND shop_id = $2 AND status = 'completed'
    `, [today, shopId]);

    const lowStockItems = await getAll(`
      SELECT id, name, quantity, min_stock_level, selling_price
      FROM items WHERE quantity <= min_stock_level AND shop_id = $1
      ORDER BY quantity ASC
    `, [shopId]);

    res.json({
      total_sales: parseFloat(totalSales.total),
      total_items_sold: parseInt(totalItemsSold.total),
      cash_sales: parseFloat(cashSales.total),
      mpesa_sales: parseFloat(mpesaSales.total),
      sacco_sales: parseFloat(saccoSales.total),
      credit_sales: parseFloat(creditSales.total),
      transaction_count: parseInt(transactionCount.total),
      low_stock_items: lowStockItems,
      date: today,
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to load dashboard summary.' });
  }
});

// GET /api/dashboard/hourly-sales
router.get('/hourly-sales', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const shopId = req.user.shop_id;

    const hourly = await getAll(`
      SELECT 
        EXTRACT(HOUR FROM created_at)::INTEGER as hour,
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM sales
      WHERE created_at::date = $1 AND shop_id = $2 AND status = 'completed'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `, [today, shopId]);

    // Fill all 24 hours
    const result = [];
    for (let h = 6; h <= 22; h++) {
      const found = hourly.find(r => r.hour === h);
      result.push({
        hour: `${String(h).padStart(2, '0')}:00`,
        total: found ? parseFloat(found.total) : 0,
        count: found ? parseInt(found.count) : 0,
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Hourly sales error:', err);
    res.status(500).json({ error: 'Failed to load hourly sales.' });
  }
});

// GET /api/dashboard/top-items
router.get('/top-items', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const shopId = req.user.shop_id;

    const topItems = await getAll(`
      SELECT 
        si.item_name as name,
        SUM(si.quantity) as quantity_sold,
        SUM(si.subtotal) as revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.created_at::date = $1 AND s.shop_id = $2 AND s.status = 'completed'
      GROUP BY si.item_id, si.item_name
      ORDER BY quantity_sold DESC
      LIMIT 5
    `, [today, shopId]);

    res.json(topItems.map(i => ({
      ...i,
      quantity_sold: parseInt(i.quantity_sold),
      revenue: parseFloat(i.revenue)
    })));
  } catch (err) {
    console.error('Top items error:', err);
    res.status(500).json({ error: 'Failed to load top items.' });
  }
});

// GET /api/dashboard/recent-transactions
router.get('/recent-transactions', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const shopId = req.user.shop_id;

    const transactions = await getAll(`
      SELECT 
        s.id, s.receipt_number, s.customer_name, s.total_amount,
        s.payment_type, s.status, s.created_at,
        COUNT(si.id) as item_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.created_at::date = $1 AND s.shop_id = $2
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 10
    `, [today, shopId]);

    res.json(transactions.map(t => ({
      ...t,
      total_amount: parseFloat(t.total_amount),
      item_count: parseInt(t.item_count)
    })));
  } catch (err) {
    console.error('Recent transactions error:', err);
    res.status(500).json({ error: 'Failed to load recent transactions.' });
  }
});

module.exports = router;
