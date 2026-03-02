const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/shifts/status - Check if a shift is open
router.get("/status", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    const shift = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
      orderBy: { startTime: "desc" },
    });

    res.json({ isOpen: !!shift, shift });
  } catch (err) {
    console.error("Shift status error:", err);
    res.status(500).json({ error: "Failed to check shift status." });
  }
});

// POST /api/shifts/open - Start a new shift
router.post("/open", async (req, res) => {
  try {
    const { opening_balance, notes } = req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    // Check if already open
    const existing = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
    });
    if (existing) {
      return res.status(400).json({ error: "You already have an open shift." });
    }

    const shift = await prisma.shiftRegister.create({
      data: {
        shopId,
        userId,
        startCash: parseFloat(opening_balance || 0),
        notes: notes || "",
        status: "open",
      },
    });

    res.status(201).json(shift);
  } catch (err) {
    console.error("Shift open error:", err);
    res.status(500).json({ error: "Failed to open shift." });
  }
});

// POST /api/shifts/close - Close shift and calculate variance
router.post("/close", async (req, res) => {
  try {
    const { closing_balance, notes } = req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    const shift = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
      orderBy: { startTime: "desc" },
    });

    if (!shift) {
      return res.status(404).json({ error: "No open shift found." });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Calculate expected cash from sales during this shift
      const cashSalesAggregation = await tx.sale.aggregate({
        _sum: { totalAmount: true },
        where: {
          shopId,
          createdAt: { gte: shift.startTime },
          paymentType: "cash",
          status: "completed",
        },
      });

      const cashSales = parseFloat(cashSalesAggregation._sum.totalAmount || 0);
      const expectedCash = parseFloat(shift.startCash) + cashSales;
      const variance = parseFloat(closing_balance) - expectedCash;

      return await tx.shiftRegister.update({
        where: { id: shift.id },
        data: {
          endTime: new Date(),
          expectedCash: expectedCash,
          actualCash: parseFloat(closing_balance),
          variance: variance,
          status: "closed",
          notes: notes || undefined,
        },
      });
    });

    res.json(result);
  } catch (err) {
    console.error("Shift close error:", err);
    res.status(500).json({ error: "Failed to close shift." });
  }
});

// GET /api/shifts/history
router.get("/history", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const shifts = await prisma.shiftRegister.findMany({
      where: { shopId },
      include: { user: { select: { fullName: true } } },
      orderBy: { startTime: "desc" },
      take: 100,
    });

    res.json(
      shifts.map((s) => ({
        ...s,
        user_name: s.user?.fullName || "Unknown",
      })),
    );
  } catch (err) {
    console.error("Shift history error:", err);
    res.status(500).json({ error: "Failed to fetch shift history." });
  }
});

module.exports = router;
