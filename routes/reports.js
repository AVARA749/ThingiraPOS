const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const router = express.Router();

router.use(authenticateToken);
// We will apply requireAdmin individually to specific report routes if needed,
// or implement scoping within the routes themselves.

// GET /api/reports/daily
router.get("/daily", async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split("T")[0];
    const date = new Date(dateStr);
    const shopId = req.user.shop_id;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sales = await prisma.sale.findMany({
      where: {
        shopId: shopId,
        status: "completed",
        userId: req.user.role === "admin" ? undefined : req.user.id,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { saleItems: true },
    });

    const results = sales.reduce(
      (acc, sale) => {
        const saleAmount = parseFloat(sale.totalAmount);
        acc.revenue += saleAmount;
        acc.txCount += 1;

        if (sale.paymentType === "cash") acc.cashTotal += saleAmount;
        else if (sale.paymentType === "mpesa") acc.mpesaTotal += saleAmount;
        else if (sale.paymentType === "sacco") acc.saccoTotal += saleAmount;
        else if (sale.paymentType === "credit") acc.creditTotal += saleAmount;

        sale.saleItems.forEach((si) => {
          acc.itemsSold += si.quantity;
          acc.cost += parseFloat(si.buyingPrice) * si.quantity;
        });

        return acc;
      },
      {
        revenue: 0,
        cost: 0,
        itemsSold: 0,
        cashTotal: 0,
        mpesaTotal: 0,
        saccoTotal: 0,
        creditTotal: 0,
        txCount: 0,
      },
    );

    res.json({
      date: dateStr,
      revenue: results.revenue,
      cost_of_goods: results.cost,
      profit_estimate: results.revenue - results.cost,
      items_sold: results.itemsSold,
      cash_sales: results.cashTotal,
      mpesa_sales: results.mpesaTotal,
      sacco_sales: results.saccoTotal,
      credit_sales: results.creditTotal,
      transaction_count: results.txCount,
    });
  } catch (err) {
    console.error("Daily report error:", err);
    res.status(500).json({ error: "Failed to generate daily report." });
  }
});

// GET /api/reports/inventory
router.get("/inventory", async (req, res) => {
  try {
    const shopId = req.user.shop_id;

    const items = await prisma.item.findMany({ where: { shopId } });

    const valuation = items.reduce(
      (acc, i) => {
        const qty = parseFloat(i.quantity || 0);
        acc.cost_value += qty * parseFloat(i.buyingPrice);
        acc.selling_value += qty * parseFloat(i.sellingPrice);
        acc.total_items += 1;
        acc.total_units += qty;
        return acc;
      },
      { cost_value: 0, selling_value: 0, total_items: 0, total_units: 0 },
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSaleItems = await prisma.saleItem.findMany({
      where: {
        shopId,
        sale: {
          status: "completed",
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      select: { itemId: true, itemName: true, quantity: true },
    });

    const movements = recentSaleItems.reduce((acc, si) => {
      acc[si.itemId] = (acc[si.itemId] || 0) + si.quantity;
      return acc;
    }, {});

    const sortedMovements = Object.entries(movements).sort(
      ([, a], [, b]) => b - a,
    );

    const fastIds = sortedMovements.slice(0, 10).map(([id]) => id);
    const fastItems = await prisma.item.findMany({
      where: { id: { in: fastIds } },
    });
    const fastMoving = fastIds.map((id) => ({
      name: fastItems.find((i) => i.id === id)?.name || "Unknown",
      sold: movements[id],
    }));

    // Slow moving: Items with least sales in last 30 days, including those with 0 sales
    const slowMovingThreshold = 30; // 30 days
    const allItems = await prisma.item.findMany({
      where: { shopId },
      select: { id: true, name: true },
    });

    const slowMoving = allItems
      .map((item) => ({
        name: item.name,
        sold: movements[item.id] || 0,
      }))
      .sort((a, b) => a.sold - b.sold)
      .slice(0, 10);

    const lowStock = items
      .filter((i) => i.quantity <= i.minStockLevel)
      .map((i) => ({
        name: i.name,
        quantity: i.quantity,
        min_stock_level: i.minStockLevel,
      }));

    res.json({
      valuation,
      fast_moving: fastMoving,
      slow_moving: slowMoving,
      low_stock: lowStock,
    });
  } catch (err) {
    console.error("Inventory report error:", err);
    res.status(500).json({ error: "Failed to generate inventory report." });
  }
});

// GET /api/reports/credit
router.get("/credit", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const { from, to } = req.query;

    // Build date filter for createdAt
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const customers = await prisma.customer.findMany({
      where: { shopId, totalCredit: { gt: 0 } },
      orderBy: { totalCredit: "desc" },
      include: {
        _count: {
          select: { creditLedgers: { where: { status: { not: "paid" } } } },
        },
      },
    });

    const outstandingEntries = await prisma.creditLedger.findMany({
      where: { 
        shopId, 
        status: { not: "paid" },
        ...(from || to ? { createdAt: dateFilter } : {}),
      },
      include: {
        sale: {
          select: { receiptNumber: true },
        },
        customer: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalOutstanding = outstandingEntries.reduce(
      (sum, entry) => sum + parseFloat(entry.balance || 0),
      0,
    );

    const payments = await prisma.creditPayment.findMany({
      where: { 
        shopId,
        ...(from || to ? { createdAt: dateFilter } : {}),
      },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        total_credit: parseFloat(c.totalCredit || 0),
        entries: c._count.creditLedgers,
      })),
      total_outstanding: totalOutstanding,
      ledger: outstandingEntries.map((l) => ({
        ...l,
        receipt_number: l.sale?.receiptNumber || "N/A",
        balance: parseFloat(l.balance || 0),
        amount: parseFloat(l.amount || 0),
        paid_amount: parseFloat(l.paidAmount || 0),
      })),
      recent_payments: payments.map((p) => ({
        ...p,
        customer_name: p.customer?.name || "Unknown",
        amount: parseFloat(p.amount || 0),
      })),
    });
  } catch (err) {
    console.error("Credit report error:", err);
    res.status(500).json({ error: "Failed to generate credit report." });
  }
});

// GET /api/reports/financial - General Ledger based P&L and Balance Sheet
router.get("/financial", requireAdmin, async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const { from, to } = req.query;

    // Build date filter for createdAt
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    // Since GeneralLedger doesn't have accountName and accountType fields in the DB schema,
    // we generate a basic summary using Sales and Purchases as a proxy for the financial report.
    const sales = await prisma.sale.aggregate({
      where: { 
        shopId, 
        status: "completed",
        ...(from || to ? { createdAt: dateFilter } : {}),
      },
      _sum: { totalAmount: true },
    });
    const purchases = await prisma.purchase.aggregate({
      where: { 
        shopId,
        ...(from || to ? { createdAt: dateFilter } : {}),
      },
      _sum: { totalCost: true },
    });

    const revenue = parseFloat(sales._sum.totalAmount || 0);
    const expenses = parseFloat(purchases._sum.totalCost || 0);

    const trialBalance = [
      {
        account_name: "Sales Revenue",
        account_type: "Revenue",
        total_debit: 0,
        total_credit: revenue,
        net_balance: revenue,
      },
      {
        account_name: "Purchases / COGS",
        account_type: "Expense",
        total_debit: expenses,
        total_credit: 0,
        net_balance: expenses,
      },
    ];

    res.json({
      trial_balance: trialBalance,
      summary: {
        total_revenue: revenue,
        total_expenses: expenses,
        net_profit: revenue - expenses,
        total_assets: 0,
        total_liabilities: 0,
        equity: revenue - expenses,
      },
    });
  } catch (err) {
    console.error("Financial report error:", err);
    res.status(500).json({ error: "Failed to generate financial report." });
  }
});

// GET /api/reports/export/csv
router.get("/export/csv", async (req, res) => {
  try {
    const { type, from, to } = req.query;
    const shopId = req.user.shop_id;
    let data = [];
    let filename = "report.csv";

    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const toD = new Date(to);
      toD.setHours(23, 59, 59, 999);
      dateFilter.lte = toD;
    }

    if (type === "sales") {
      const sales = await prisma.sale.findMany({
        where: {
          shopId,
          userId: req.user.role === "admin" ? undefined : req.user.id,
          createdAt: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
        orderBy: { createdAt: "desc" },
      });
      data = sales.map((s) => ({
        receipt_number: s.receiptNumber,
        customer_name: s.customerName,
        total_amount: parseFloat(s.totalAmount),
        payment_type: s.paymentType,
        status: s.status,
        created_at: s.createdAt,
      }));
      filename = "sales_report.csv";
    } else if (type === "inventory") {
      const items = await prisma.item.findMany({
        where: { shopId },
        orderBy: { name: "asc" },
      });
      data = items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        buying_price: parseFloat(i.buyingPrice),
        selling_price: parseFloat(i.sellingPrice),
        value: i.quantity * parseFloat(i.sellingPrice),
        status:
          i.quantity <= 0 ? "OUT"
          : i.quantity <= i.minStockLevel ? "LOW"
          : "OK",
      }));
      filename = "inventory_report.csv";
    } else if (type === "credit") {
      const ledger = await prisma.creditLedger.findMany({
        where: {
          shopId,
          createdAt: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
        orderBy: { createdAt: "desc" },
      });
      data = ledger.map((l) => ({
        customer_name: l.customerName,
        amount: parseFloat(l.amount),
        paid_amount: parseFloat(l.paidAmount),
        balance: parseFloat(l.balance),
        status: l.status,
        created_at: l.createdAt,
      }));
      filename = "credit_report.csv";
    }

    if (data.length === 0)
      return res.status(404).json({ error: "No data found." });

    const headers = Object.keys(data[0]).join(",");
    const rows = data
      .map((r) =>
        Object.values(r)
          .map((v) => `"${v}"`)
          .join(","),
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(headers + "\n" + rows);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Failed to export report." });
  }
});

module.exports = router;
