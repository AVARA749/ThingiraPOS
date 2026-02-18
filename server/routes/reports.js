const express = require('express');
const { getOne, getAll, query } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();
router.use(authenticateToken);

// GET /api/reports/daily
router.get('/daily', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const shopId = req.user.shop_id;

        const queries = {
            revenue: [`SELECT COALESCE(SUM(total_amount),0) as total FROM sales WHERE created_at::date=$1 AND shop_id=$2 AND status='completed'`, [date, shopId]],
            cost: [`SELECT COALESCE(SUM(si.buying_price*si.quantity),0) as total FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE s.created_at::date=$1 AND s.shop_id=$2 AND s.status='completed'`, [date, shopId]],
            itemsSold: [`SELECT COALESCE(SUM(si.quantity),0) as total FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE s.created_at::date=$1 AND s.shop_id=$2 AND s.status='completed'`, [date, shopId]],
            cashTotal: [`SELECT COALESCE(SUM(total_amount),0) as total FROM sales WHERE created_at::date=$1 AND shop_id=$2 AND payment_type='cash' AND status='completed'`, [date, shopId]],
            mpesaTotal: [`SELECT COALESCE(SUM(total_amount),0) as total FROM sales WHERE created_at::date=$1 AND shop_id=$2 AND payment_type='mpesa' AND status='completed'`, [date, shopId]],
            saccoTotal: [`SELECT COALESCE(SUM(total_amount),0) as total FROM sales WHERE created_at::date=$1 AND shop_id=$2 AND payment_type='sacco' AND status='completed'`, [date, shopId]],
            creditTotal: [`SELECT COALESCE(SUM(total_amount),0) as total FROM sales WHERE created_at::date=$1 AND shop_id=$2 AND payment_type='credit' AND status='completed'`, [date, shopId]],
            txCount: [`SELECT COUNT(*) as total FROM sales WHERE created_at::date=$1 AND shop_id=$2 AND status='completed'`, [date, shopId]]
        };

        const results = {};
        for (const [key, [sql, params]] of Object.entries(queries)) {
            const res = await getOne(sql, params);
            results[key] = parseFloat(res.total || 0);
        }

        res.json({
            date,
            revenue: results.revenue,
            cost_of_goods: results.cost,
            profit_estimate: results.revenue - results.cost,
            items_sold: results.itemsSold,
            cash_sales: results.cashTotal,
            mpesa_sales: results.mpesaTotal,
            sacco_sales: results.saccoTotal,
            credit_sales: results.creditTotal,
            transaction_count: results.txCount
        });
    } catch (err) {
        console.error('Daily report error:', err);
        res.status(500).json({ error: 'Failed to generate daily report.' });
    }
});

// GET /api/reports/inventory
router.get('/inventory', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const valuation = await getOne(`SELECT SUM(quantity*buying_price) as cost_value, SUM(quantity*selling_price) as selling_value, COUNT(*)::INTEGER as total_items, SUM(quantity)::INTEGER as total_units FROM items WHERE shop_id = $1`, [shopId]);
        const fast = await getAll(`SELECT i.name, SUM(si.quantity)::INTEGER as sold FROM sale_items si JOIN items i ON si.item_id=i.id JOIN sales s ON si.sale_id=s.id WHERE s.shop_id = $1 AND s.status='completed' AND s.created_at::date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY si.item_id, i.name ORDER BY sold DESC LIMIT 10`, [shopId]);
        const slow = await getAll(`SELECT i.name, COALESCE(sq.sold,0)::INTEGER as sold FROM items i LEFT JOIN (SELECT item_id, SUM(quantity) as sold FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE s.shop_id = $1 AND s.status='completed' AND s.created_at::date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY item_id) sq ON i.id=sq.item_id WHERE i.shop_id = $1 ORDER BY sold ASC LIMIT 10`, [shopId]);
        const lowStock = await getAll(`SELECT name, quantity, min_stock_level FROM items WHERE shop_id = $1 AND quantity<=min_stock_level ORDER BY quantity`, [shopId]);

        res.json({
            valuation: {
                ...valuation,
                cost_value: parseFloat(valuation.cost_value || 0),
                selling_value: parseFloat(valuation.selling_value || 0)
            },
            fast_moving: fast,
            slow_moving: slow,
            low_stock: lowStock
        });
    } catch (err) {
        console.error('Inventory report error:', err);
        res.status(500).json({ error: 'Failed to generate inventory report.' });
    }
});

// GET /api/reports/credit
router.get('/credit', async (req, res) => {
    try {
        const shopId = req.user.shop_id;
        const customers = await getAll(`SELECT c.id, c.name, c.phone, c.total_credit, COUNT(cl.id)::INTEGER as entries FROM customers c LEFT JOIN credit_ledger cl ON c.id=cl.customer_id AND cl.status!='paid' AND cl.shop_id = $1 WHERE c.shop_id = $1 AND c.total_credit>0 GROUP BY c.id ORDER BY c.total_credit DESC`, [shopId]);
        const totalOutstanding = await getOne(`SELECT COALESCE(SUM(balance),0) as total FROM credit_ledger WHERE shop_id = $1 AND status!='paid'`, [shopId]);
        const ledger = await getAll(`SELECT cl.*, s.receipt_number FROM credit_ledger cl JOIN sales s ON cl.sale_id=s.id WHERE cl.shop_id = $1 AND cl.status!='paid' ORDER BY cl.created_at DESC`, [shopId]);

        // Add recent payments history
        const payments = await getAll(`SELECT cp.*, c.name as customer_name FROM credit_payments cp JOIN customers c ON cp.customer_id = c.id WHERE cp.shop_id = $1 ORDER BY cp.created_at DESC LIMIT 50`, [shopId]);

        res.json({
            customers: customers.map(c => ({ ...c, total_credit: parseFloat(c.total_credit) })),
            total_outstanding: parseFloat(totalOutstanding.total),
            ledger: ledger.map(l => ({ ...l, balance: parseFloat(l.balance), amount: parseFloat(l.amount), paid_amount: parseFloat(l.paid_amount) })),
            recent_payments: payments.map(p => ({ ...p, amount: parseFloat(p.amount) }))
        });
    } catch (err) {
        console.error('Credit report error:', err);
        res.status(500).json({ error: 'Failed to generate credit report.' });
    }
});

// GET /api/reports/financial - General Ledger based P&L and Balance Sheet
router.get('/financial', async (req, res) => {
    try {
        const shopId = req.user.shop_id;

        // Trial Balance
        const trialBalance = await getAll(`
            SELECT account_name, account_type, 
                   SUM(debit) as total_debit, 
                   SUM(credit) as total_credit,
                   (SUM(debit) - SUM(credit)) as net_balance
            FROM general_ledger 
            WHERE shop_id = $1 
            GROUP BY account_name, account_type
            ORDER BY account_type, account_name
        `, [shopId]);

        // Calculate P&L from ledger
        const revenue = await getOne(`SELECT SUM(credit - debit) as total FROM general_ledger WHERE shop_id = $1 AND account_type = 'Revenue'`, [shopId]);
        const expenses = await getOne(`SELECT SUM(debit - credit) as total FROM general_ledger WHERE shop_id = $1 AND account_type = 'Expense'`, [shopId]);

        // Calculate Assets/Liabilities
        const assets = await getOne(`SELECT SUM(debit - credit) as total FROM general_ledger WHERE shop_id = $1 AND account_type = 'Asset'`, [shopId]);
        const liabilities = await getOne(`SELECT SUM(credit - debit) as total FROM general_ledger WHERE shop_id = $1 AND account_type = 'Liability'`, [shopId]);

        res.json({
            trial_balance: trialBalance.map(b => ({
                ...b,
                total_debit: parseFloat(b.total_debit),
                total_credit: parseFloat(b.total_credit),
                net_balance: parseFloat(b.net_balance)
            })),
            summary: {
                total_revenue: parseFloat(revenue.total || 0),
                total_expenses: parseFloat(expenses.total || 0),
                net_profit: parseFloat(revenue.total || 0) - parseFloat(expenses.total || 0),
                total_assets: parseFloat(assets.total || 0),
                total_liabilities: parseFloat(liabilities.total || 0),
                equity: parseFloat(assets.total || 0) - parseFloat(liabilities.total || 0)
            }
        });
    } catch (err) {
        console.error('Financial report error:', err);
        res.status(500).json({ error: 'Failed to generate financial report.' });
    }
});

// GET /api/reports/export/csv
router.get('/export/csv', async (req, res) => {
    try {
        const { type, from, to } = req.query;
        const shopId = req.user.shop_id;
        let data = []; let filename = 'report.csv';
        let sql = '';
        let params = [shopId];

        if (type === 'sales') {
            sql = `SELECT s.receipt_number, s.customer_name, s.total_amount, s.payment_type, s.status, s.created_at FROM sales s WHERE s.shop_id = $1`;
            if (from) { params.push(from); sql += ` AND s.created_at::date >= $${params.length}`; }
            if (to) { params.push(to); sql += ` AND s.created_at::date <= $${params.length}`; }
            sql += ` ORDER BY s.created_at DESC`;
            data = await getAll(sql, params);
            filename = 'sales_report.csv';
        } else if (type === 'inventory') {
            data = await getAll(`SELECT name, quantity, buying_price, selling_price, (quantity*selling_price) as value, CASE WHEN quantity<=0 THEN 'OUT' WHEN quantity<=min_stock_level THEN 'LOW' ELSE 'OK' END as status FROM items WHERE shop_id = $1 ORDER BY name`, [shopId]);
            filename = 'inventory_report.csv';
        } else if (type === 'credit') {
            data = await getAll(`SELECT customer_name, amount, paid_amount, balance, status, created_at FROM credit_ledger WHERE shop_id = $1 ORDER BY created_at DESC`, [shopId]);
            filename = 'credit_report.csv';
        }

        if (data.length === 0) return res.status(404).json({ error: 'No data found.' });

        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(r => Object.values(r).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(headers + '\n' + rows);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Failed to export report.' });
    }
});

module.exports = router;
