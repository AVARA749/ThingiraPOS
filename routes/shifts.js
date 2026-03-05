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
      include: {
        nozzleShiftReadings: {
          include: {
            nozzle: {
              include: { pump: true }
            }
          }
        },
        pettyCashEntries: true
      }
    });

    res.json({ isOpen: !!shift, shift });
  } catch (err) {
    console.error("Shift status error:", err);
    res.status(500).json({ error: "Failed to check shift status." });
  }
});

// POST /api/shifts/open - Start a new shift with optional nozzle readings
router.post("/open", async (req, res) => {
  try {
    const { opening_balance, notes, nozzleReadings } = req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    // Check if already open
    const existing = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
    });
    if (existing) {
      return res.status(400).json({ error: "You already have an open shift." });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create the shift
      const shift = await tx.shiftRegister.create({
        data: {
          shopId,
          userId,
          startCash: parseFloat(opening_balance || 0),
          notes: notes || "",
          status: "open",
        },
      });

      // If nozzle readings provided, create them
      if (nozzleReadings && Array.isArray(nozzleReadings) && nozzleReadings.length > 0) {
        for (const reading of nozzleReadings) {
          await tx.nozzleShiftReading.create({
            data: {
              shiftId: shift.id,
              nozzleId: reading.nozzleId,
              openingReading: parseFloat(reading.openingReading),
              openingTime: new Date(),
            },
          });
        }
      }

      return shift;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("Shift open error:", err);
    res.status(500).json({ error: "Failed to open shift." });
  }
});

// POST /api/shifts/close - Close shift with validation and petty cash
router.post("/close", async (req, res) => {
  try {
    const { closing_balance, notes, nozzleReadings, pettyCashExpenses, skipMeterValidation } = req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const shift = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
      orderBy: { startTime: "desc" },
      include: {
        nozzleShiftReadings: {
          include: { nozzle: true }
        }
      }
    });

    if (!shift) {
      return res.status(404).json({ error: "No open shift found." });
    }

    // Validate nozzle readings if provided
    if (nozzleReadings && Array.isArray(nozzleReadings) && !skipMeterValidation) {
      for (const reading of nozzleReadings) {
        const existingReading = shift.nozzleShiftReadings.find(
          nr => nr.nozzleId === reading.nozzleId
        );
        
        if (existingReading && reading.closingReading < existingReading.openingReading) {
          return res.status(400).json({
            error: `Meter rollback detected for nozzle ${reading.nozzleId}. Please verify reading.`,
            code: "METER_ROLLBACK"
          });
        }

        // Check for unreasonably high volume (configurable threshold, default 5000L)
        if (existingReading) {
          const volumeSold = reading.closingReading - existingReading.openingReading;
          if (volumeSold > 5000) {
            return res.status(400).json({
              error: `This volume (${volumeSold}L) seems unusually high. Are you sure?`,
              code: "HIGH_VOLUME_WARNING",
              volume: volumeSold
            });
          }
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Calculate expected cash from sales during this shift
      const salesAggregation = await tx.sale.aggregate({
        _sum: { totalAmount: true },
        where: {
          shopId,
          createdAt: { gte: shift.startTime },
          status: "completed",
        },
      });

      // Get payment type breakdown
      const cashSalesResult = await tx.sale.groupBy({
        by: ["paymentType"],
        _sum: { totalAmount: true },
        where: {
          shopId,
          createdAt: { gte: shift.startTime },
          status: "completed",
        },
      });

      const cashSales = cashSalesResult.find(s => s.paymentType === "cash")?._sum?.totalAmount || 0;
      const cardSales = cashSalesResult.find(s => s.paymentType === "card")?._sum?.totalAmount || 0;
      const mpesaSales = cashSalesResult.find(s => s.paymentType === "mpesa")?._sum?.totalAmount || 0;

      const expectedCash = parseFloat(shift.startCash) + parseFloat(cashSales);
      const variance = parseFloat(closing_balance) - expectedCash;

      // Update nozzle readings with closing values
      if (nozzleReadings && Array.isArray(nozzleReadings)) {
        for (const reading of nozzleReadings) {
          const existingReading = shift.nozzleShiftReadings.find(
            nr => nr.nozzleId === reading.nozzleId
          );

          if (existingReading) {
            const volumeSold = parseFloat(reading.closingReading) - parseFloat(existingReading.openingReading);
            const nozzle = await tx.nozzle.findUnique({ where: { id: reading.nozzleId } });
            const amountSold = volumeSold * parseFloat(nozzle?.unitPrice || 0);

            await tx.nozzleShiftReading.update({
              where: { id: existingReading.id },
              data: {
                closingReading: parseFloat(reading.closingReading),
                closingTime: new Date(),
                volumeSold,
                amountSold,
              },
            });
          }
        }
      }

      // Create petty cash entries
      if (pettyCashExpenses && Array.isArray(pettyCashExpenses) && pettyCashExpenses.length > 0) {
        for (const expense of pettyCashExpenses) {
          await tx.pettyCashEntry.create({
            data: {
              shiftId: shift.id,
              amount: parseFloat(expense.amount),
              category: expense.category || "other",
              description: expense.description || "",
              shopId,
            },
          });
        }
      }

      // Calculate total petty cash for the shift
      const pettyCashTotal = await tx.pettyCashEntry.aggregate({
        _sum: { amount: true },
        where: { shiftId: shift.id },
      });

      // Adjust expected cash for petty cash
      const adjustedExpectedCash = expectedCash - (pettyCashTotal._sum.amount || 0);
      const adjustedVariance = parseFloat(closing_balance) - adjustedExpectedCash;

      return await tx.shiftRegister.update({
        where: { id: shift.id },
        data: {
          endTime: new Date(),
          endCash: parseFloat(closing_balance),
          expectedCash: adjustedExpectedCash,
          actualCash: parseFloat(closing_balance),
          variance: adjustedVariance,
          totalCashSales: parseFloat(cashSales),
          totalCardSales: parseFloat(cardSales),
          totalMpesaSales: parseFloat(mpesaSales),
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
      include: { 
        user: { select: { fullName: true } },
        pettyCashEntries: true
      },
      orderBy: { startTime: "desc" },
      take: 100,
    });

    res.json(
      shifts.map((s) => ({
        ...s,
        user_name: s.user?.fullName || "Unknown",
        pettyCashTotal: s.pettyCashEntries?.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0,
      })),
    );
  } catch (err) {
    console.error("Shift history error:", err);
    res.status(500).json({ error: "Failed to fetch shift history." });
  }
});

// GET /api/shifts/analytics - Dashboard analytics for shift metrics
router.get("/analytics", async (req, res) => {
  try {
    const { startDate, endDate, shopId: queryShopId } = req.query;
    const shopId = queryShopId || req.user.shop_id;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get shifts in date range
    const shifts = await prisma.shiftRegister.findMany({
      where: {
        shopId,
        status: "closed",
        startTime: { gte: start, lte: end },
      },
      include: {
        user: { select: { fullName: true } },
        nozzleShiftReadings: {
          include: { nozzle: true }
        }
      },
      orderBy: { startTime: "desc" },
    });

    // Calculate totals
    const totalCashSales = shifts.reduce((sum, s) => sum + (parseFloat(s.totalCashSales) || 0), 0);
    const totalCardSales = shifts.reduce((sum, s) => sum + (parseFloat(s.totalCardSales) || 0), 0);
    const totalMpesaSales = shifts.reduce((sum, s) => sum + (parseFloat(s.totalMpesaSales) || 0), 0);
    const totalVariance = shifts.reduce((sum, s) => sum + (parseFloat(s.variance) || 0), 0);

    // Get fuel distribution from nozzle readings
    const fuelDistribution = {};
    for (const shift of shifts) {
      for (const reading of shift.nozzleShiftReadings) {
        const fuelType = reading.nozzle?.fuelType || "petrol";
        if (!fuelDistribution[fuelType]) {
          fuelDistribution[fuelType] = { volume: 0, amount: 0 };
        }
        fuelDistribution[fuelType].volume += parseFloat(reading.volumeSold) || 0;
        fuelDistribution[fuelType].amount += parseFloat(reading.amountSold) || 0;
      }
    }

    // Calculate daily sales trends
    const dailySales = {};
    for (const shift of shifts) {
      const date = new Date(shift.startTime).toISOString().split("T")[0];
      if (!dailySales[date]) {
        dailySales[date] = { petrol: 0, diesel: 0, kerosene: 0, total: 0 };
      }
      
      for (const reading of shift.nozzleShiftReadings || []) {
        const fuelType = reading.nozzle?.fuelType || "petrol";
        const amount = parseFloat(reading.amountSold) || 0;
        dailySales[date][fuelType] += amount;
        dailySales[date].total += amount;
      }
    }

    // Variance data for bar chart
    const varianceData = shifts.map((s) => ({
      shiftId: s.id,
      cashierName: s.user?.fullName || "Unknown",
      date: new Date(s.startTime).toISOString().split("T")[0],
      variance: parseFloat(s.variance) || 0,
      status: (s.variance || 0) === 0 ? "balanced" : (s.variance > 0 ? "surplus" : "shortage"),
    }));

    res.json({
      totalSales: totalCashSales + totalCardSales + totalMpesaSales,
      totalVolume: Object.values(fuelDistribution).reduce((sum, f) => sum + f.volume, 0),
      totalVariance,
      shiftCount: shifts.length,
      salesTrends: Object.entries(dailySales).map(([date, data]) => ({
        date,
        ...data,
      })),
      varianceData,
      fuelDistribution: Object.entries(fuelDistribution).map(([fuelType, data]) => ({
        fuelType,
        volume: data.volume,
        amount: data.amount,
        percentage: (data.volume / (Object.values(fuelDistribution).reduce((s, f) => s + f.volume, 0) || 1)) * 100,
      })),
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics." });
  }
});

// GET /api/shifts/pumps - Get all pumps and nozzles for the shop
router.get("/pumps", async (req, res) => {
  try {
    const shopId = req.user.shop_id;

    const pumps = await prisma.pump.findMany({
      where: { shopId, isActive: true },
      include: {
        nozzles: {
          where: { isActive: true },
          orderBy: { nozzleNumber: "asc" },
        },
      },
      orderBy: { pumpNumber: "asc" },
    });

    res.json(pumps);
  } catch (err) {
    console.error("Pumps error:", err);
    res.status(500).json({ error: "Failed to fetch pumps." });
  }
});

// POST /api/shifts/pumps - Create a new pump
router.post("/pumps", async (req, res) => {
  try {
    const { name, pumpNumber, nozzles } = req.body;
    const shopId = req.user.shop_id;

    const pump = await prisma.pump.create({
      data: {
        shopId,
        name,
        pumpNumber: parseInt(pumpNumber),
        nozzles: {
          create: nozzles.map((n, idx) => ({
            nozzleNumber: n.nozzleNumber || idx + 1,
            fuelType: n.fuelType,
            unitPrice: parseFloat(n.unitPrice) || 0,
            isActive: true,
            shopId,
          })),
        },
      },
      include: { nozzles: true },
    });

    res.status(201).json(pump);
  } catch (err) {
    console.error("Create pump error:", err);
    res.status(500).json({ error: "Failed to create pump." });
  }
});

// POST /api/shifts/petty-cash - Add petty cash entry during active shift
router.post("/petty-cash", async (req, res) => {
  try {
    const { amount, category, description } = req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    // Find active shift
    const shift = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
    });

    if (!shift) {
      return res.status(404).json({ error: "No open shift found." });
    }

    const entry = await prisma.pettyCashEntry.create({
      data: {
        shiftId: shift.id,
        amount: parseFloat(amount),
        category: category || "other",
        description: description || "",
        shopId,
      },
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error("Petty cash error:", err);
    res.status(500).json({ error: "Failed to add petty cash entry." });
  }
});

// GET /api/shifts/:id - Get shift details with all readings
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.user.shop_id;

    const shift = await prisma.shiftRegister.findFirst({
      where: { id, shopId },
      include: {
        user: { select: { fullName: true } },
        nozzleShiftReadings: {
          include: { nozzle: { include: { pump: true } } },
        },
        pettyCashEntries: true,
      },
    });

    if (!shift) {
      return res.status(404).json({ error: "Shift not found." });
    }

    res.json(shift);
  } catch (err) {
    console.error("Get shift error:", err);
    res.status(500).json({ error: "Failed to fetch shift." });
  }
});

module.exports = router;
