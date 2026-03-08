const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/dashboard/summary
router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const shopId = req.user.shop_id;
    const isStaff = req.user.role === "staff";

    let dateFilter = {};
    if (
      !isStaff &&
      startDate &&
      endDate &&
      startDate !== "undefined" &&
      endDate !== "undefined"
    ) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    } else {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = { gte: startOfDay, lte: endOfDay };
    }

    const whereClause = {
      shopId: shopId,
      status: "completed",
      createdAt: dateFilter,
    };

    // Staff only see their own performance
    if (isStaff) {
      whereClause.userId = req.user.id;
    }

    const sales = await prisma.sale.findMany({
      where: whereClause,
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

    let lowStock = [];
    // Only admins see low stock alerts
    if (!isStaff) {
      lowStock = await prisma.$queryRaw`
        SELECT id, name, quantity, min_stock_level as "minStockLevel", selling_price as "sellingPrice" 
        FROM items 
        WHERE quantity <= min_stock_level AND shop_id = ${shopId} 
        ORDER BY quantity ASC
      `;
    }

    res.json({
      ...summary,
      low_stock_items: lowStock,
      date: startDate || new Date().toISOString().split("T")[0],
    });
  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({ error: "Failed to load dashboard summary." });
  }
});

// GET /api/dashboard/hourly-sales
router.get("/hourly-sales", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const shopId = req.user.shop_id;
    const isStaff = req.user.role === "staff";

    let dateFilter = {};
    if (
      !isStaff &&
      startDate &&
      endDate &&
      startDate !== "undefined" &&
      endDate !== "undefined"
    ) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    } else {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = { gte: startOfDay, lte: endOfDay };
    }

    const whereClause = {
      shopId,
      status: "completed",
      createdAt: dateFilter,
    };

    if (isStaff) {
      whereClause.userId = req.user.id;
    }

    const sales = await prisma.sale.findMany({
      where: whereClause,
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
    const { startDate, endDate } = req.query;
    const shopId = req.user.shop_id;
    const isStaff = req.user.role === "staff";

    let dateFilter = {};
    if (
      !isStaff &&
      startDate &&
      endDate &&
      startDate !== "undefined" &&
      endDate !== "undefined"
    ) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    } else {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      dateFilter = { gte: startOfDay };
    }

    const saleItems = await prisma.saleItem.findMany({
      where: {
        shopId,
        sale: {
          status: "completed",
          createdAt: dateFilter,
          ...(isStaff ? { userId: req.user.id } : {}),
        },
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
    const isStaff = req.user.role === "staff";

    const whereClause = { shopId };

    // Staff limited to their own today's transactions
    if (isStaff) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      whereClause.userId = req.user.id;
      whereClause.createdAt = { gte: startOfDay };
    }

    const transactions = await prisma.sale.findMany({
      where: whereClause,
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
