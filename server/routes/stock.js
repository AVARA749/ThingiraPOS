const express = require("express");
const prisma = require("../db/prisma");
const { authenticateToken } = require("../middleware/auth");
const router = express.Router();
router.use(authenticateToken);

function getDateRange(period, from, to) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);

  if (period === "today") {
    return { gte: start };
  } else if (period === "week") {
    start.setDate(today.getDate() - 7);
    return { gte: start };
  } else if (period === "month") {
    start.setDate(today.getDate() - 30);
    return { gte: start };
  } else {
    const range = {};
    if (from) range.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      range.lte = toDate;
    }
    return Object.keys(range).length ? range : undefined;
  }
}

router.get("/movements", async (req, res) => {
  try {
    const { type, from, to, period } = req.query;
    const shopId = req.user.shop_id;

    const where = { shopId: shopId };
    if (type) where.movementType = type;

    const dateRange = getDateRange(period, from, to);
    if (dateRange) where.createdAt = dateRange;

    const movements = await prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json(
      movements.map((m) => ({
        ...m,
        quantity: m.quantity,
        balance_after: m.balanceAfter,
      })),
    );
  } catch (err) {
    console.error("Movements error:", err);
    res.status(500).json({ error: "Failed to fetch movements." });
  }
});

router.get("/in", async (req, res) => {
  try {
    const { from, to, period } = req.query;
    const shopId = req.user.shop_id;
    const where = { shopId: shopId, movementType: "IN" };

    const dateRange = getDateRange(period, from, to);
    if (dateRange) where.createdAt = dateRange;

    const movements = await prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(movements);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stock in." });
  }
});

router.get("/out", async (req, res) => {
  try {
    const { from, to, period } = req.query;
    const shopId = req.user.shop_id;
    const where = { shopId: shopId, movementType: { in: ["OUT", "RETURN"] } };

    const dateRange = getDateRange(period, from, to);
    if (dateRange) where.createdAt = dateRange;

    const movements = await prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(movements);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stock out." });
  }
});

router.get("/current", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const items = await prisma.item.findMany({
      where: { shopId: shopId },
      orderBy: [
        { quantity: "asc" }, // Simplified status-like ordering
        { name: "asc" },
      ],
    });

    const summaryData = items.reduce(
      (acc, curr) => {
        const qty = curr.quantity || 0;
        const buying = parseFloat(curr.buyingPrice || 0);
        const selling = parseFloat(curr.sellingPrice || 0);

        acc.total_items += 1;
        acc.total_units += qty;
        acc.total_value_selling += qty * selling;
        acc.total_value_cost += qty * buying;

        if (qty <= 0) acc.out_of_stock += 1;
        else if (qty <= curr.minStockLevel) acc.low_stock += 1;

        return acc;
      },
      {
        total_items: 0,
        total_units: 0,
        total_value_selling: 0,
        total_value_cost: 0,
        out_of_stock: 0,
        low_stock: 0,
      },
    );

    res.json({
      items: items.map((i) => {
        const qty = i.quantity;
        const buying = parseFloat(i.buyingPrice);
        const selling = parseFloat(i.sellingPrice);
        let status = "OK";
        if (qty <= 0) status = "OUT";
        else if (qty <= i.minStockLevel) status = "LOW";

        return {
          ...i,
          buying_price: buying,
          selling_price: selling,
          value_selling: qty * selling,
          value_cost: qty * buying,
          status,
        };
      }),
      summary: summaryData,
    });
  } catch (err) {
    console.error("Current stock error:", err);
    res.status(500).json({ error: "Failed to fetch current stock." });
  }
});

module.exports = router;
