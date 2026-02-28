const express = require("express");
const prisma = require("../db/prisma");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/dashboard/summary
router.get("/summary", async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const shopId = req.user.shop_id;

    const sales = await prisma.sale.findMany({
      where: {
        shopId: shopId,
        status: "completed",
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { saleItems: { select: { quantity: true } } },
    });

    const summary = sales.reduce(
      (acc, sale) => {
        const amount = parseFloat(sale.totalAmount);
        acc.total_sales += amount;
        acc.transaction_count += 1;

        if (sale.paymentType === "cash") acc.cash_sales += amount;
        else if (sale.paymentType === "mpesa") acc.mpesa_sales += amount;
        else if (sale.paymentType === "sacco") acc.sacco_sales += amount;
        else if (sale.paymentType === "credit") acc.credit_sales += amount;

        acc.total_items_sold += sale.saleItems.reduce(
          (sum, si) => sum + si.quantity,
          0,
        );

        return acc;
      },
      {
        total_sales: 0,
        total_items_sold: 0,
        cash_sales: 0,
        mpesa_sales: 0,
        sacco_sales: 0,
        credit_sales: 0,
        transaction_count: 0,
      },
    );

    const lowStockItems = await prisma.item.findMany({
      where: { shopId, quantity: { lte: prisma.item.minStockLevel } }, // This is a bit tricky since minStockLevel is a column.
      // Actually, Prisma doesn't support column-to-column comparison in 'where' easily without raw or a lot of items.
      // But usually we can fetch and filter if it's small, or use raw.
    });

    // Correct way for column comparison in Prisma currently is often $queryRaw if we want it DB-side.
    // Let's use raw for this specific one to be efficient.
    const lowStock =
      await prisma.$queryRaw`SELECT id, name, quantity, "minStockLevel", "sellingPrice" as selling_price FROM items WHERE quantity <= "minStockLevel" AND "shopId" = ${shopId} ORDER BY quantity ASC`;

    res.json({
      ...summary,
      low_stock_items: lowStock,
      date: todayStr,
    });
  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({ error: "Failed to load dashboard summary." });
  }
});

// GET /api/dashboard/hourly-sales
router.get("/hourly-sales", async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const shopId = req.user.shop_id;

    const sales = await prisma.sale.findMany({
      where: {
        shopId,
        status: "completed",
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const hourly = sales.reduce((acc, sale) => {
      const hour = new Date(sale.createdAt).getHours();
      if (!acc[hour]) acc[hour] = { total: 0, count: 0 };
      acc[hour].total += parseFloat(sale.totalAmount);
      acc[hour].count += 1;
      return acc;
    }, {});

    const result = [];
    for (let h = 6; h <= 22; h++) {
      result.push({
        hour: `${String(h).padStart(2, "0")}:00`,
        total: hourly[h]?.total || 0,
        count: hourly[h]?.count || 0,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("Hourly sales error:", err);
    res.status(500).json({ error: "Failed to load hourly sales." });
  }
});

// GET /api/dashboard/top-items
router.get("/top-items", async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const shopId = req.user.shop_id;

    const saleItems = await prisma.saleItem.findMany({
      where: {
        shopId,
        sale: { status: "completed", createdAt: { gte: startOfDay } },
      },
    });

    const itemSummary = saleItems.reduce((acc, si) => {
      if (!acc[si.itemId])
        acc[si.itemId] = { name: si.itemName, quantity_sold: 0, revenue: 0 };
      acc[si.itemId].quantity_sold += si.quantity;
      acc[si.itemId].revenue += parseFloat(si.subtotal);
      return acc;
    }, {});

    const result = Object.values(itemSummary)
      .sort((a, b) => b.quantity_sold - a.quantity_sold)
      .slice(0, 5);

    res.json(result);
  } catch (err) {
    console.error("Top items error:", err);
    res.status(500).json({ error: "Failed to load top items." });
  }
});

// GET /api/dashboard/recent-transactions
router.get("/recent-transactions", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const transactions = await prisma.sale.findMany({
      where: { shopId, createdAt: { gte: startOfDay } },
      include: { _count: { select: { saleItems: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json(
      transactions.map((t) => ({
        id: t.id,
        receipt_number: t.receiptNumber,
        customer_name: t.customerName,
        total_amount: parseFloat(t.totalAmount),
        payment_type: t.paymentType,
        status: t.status,
        created_at: t.createdAt,
        item_count: t._count.saleItems,
      })),
    );
  } catch (err) {
    console.error("Recent transactions error:", err);
    res.status(500).json({ error: "Failed to load recent transactions." });
  }
});

module.exports = router;
