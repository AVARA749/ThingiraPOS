const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/shifts/status - Check for open or assigned shifts
router.get("/status", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    // First check for active open shift
    let shift = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
      orderBy: { startTime: "desc" },
      include: {
        nozzleShiftReadings: {
          include: {
            nozzle: {
              include: { pump: true },
            },
          },
        },
      },
    });

    if (shift) {
      return res.json({ isOpen: true, shift });
    }

    // If no open shift, check for assigned shifts
    const assignedShifts = await prisma.shiftRegister.findMany({
      where: { shopId, userId, status: "assigned" },
      orderBy: { createdAt: "desc" },
    });

    res.json({ isOpen: false, assignedShifts });
  } catch (err) {
    console.error("Shift status error:", err);
    res.status(500).json({ error: "Failed to check shift status." });
  }
});

// POST /api/shifts/assign - Admin pre-assigns a shift to a staff member
router.post("/assign", async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "owner") {
      return res.status(403).json({ error: "Only admins can assign shifts." });
    }

    const { userId, notes } = req.body;
    const shopId = req.user.shop_id;

    const shift = await prisma.shiftRegister.create({
      data: {
        shopId,
        userId,
        notes: notes || "",
        status: "assigned",
      },
    });

    res.status(201).json(shift);
  } catch (err) {
    console.error("Shift assign error:", err);
    res.status(500).json({ error: "Failed to assign shift." });
  }
});

// POST /api/shifts/open - Start an assigned shift OR open a new one
router.post("/open", async (req, res) => {
  try {
    const { opening_balance, notes, nozzleReadings, shiftId } = req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    if (!shopId) {
      return res.status(400).json({ error: "No shop assigned." });
    }

    // Check if user already has an open shift
    const existing = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
    });
    if (existing) {
      return res.status(400).json({ error: "You already have an open shift." });
    }

    const result = await prisma.$transaction(async (tx) => {
      let shift;

      if (shiftId) {
        // Starting a pre-assigned shift
        shift = await tx.shiftRegister.update({
          where: { id: shiftId, userId, status: "assigned" },
          data: {
            status: "open",
            startTime: new Date(),
            startCash: parseFloat(opening_balance || 0),
            notes: notes || undefined,
          },
        });
      } else {
        // Opening an ad-hoc shift (if allowed, or just create new)
        shift = await tx.shiftRegister.create({
          data: {
            shopId,
            userId,
            startCash: parseFloat(opening_balance || 0),
            notes: notes || "",
            status: "open",
            startTime: new Date(),
          },
        });
      }

      // If nozzle readings provided, create them
      if (
        nozzleReadings &&
        Array.isArray(nozzleReadings) &&
        nozzleReadings.length > 0
      ) {
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
    const { closing_balance, notes, nozzleReadings, skipMeterValidation } =
      req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const shift = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
      orderBy: { startTime: "desc" },
      include: {
        nozzleShiftReadings: {
          include: { nozzle: true },
        },
      },
    });

    if (!shift) {
      return res.status(404).json({ error: "No open shift found." });
    }

    // Validate nozzle readings if provided
    if (
      nozzleReadings &&
      Array.isArray(nozzleReadings) &&
      !skipMeterValidation
    ) {
      for (const reading of nozzleReadings) {
        const existingReading = shift.nozzleShiftReadings.find(
          (nr) => nr.nozzleId === reading.nozzleId,
        );

        if (
          existingReading &&
          reading.closingReading < existingReading.openingReading
        ) {
          return res.status(400).json({
            error: `Meter rollback detected for nozzle ${reading.nozzleId}. Please verify reading.`,
            code: "METER_ROLLBACK",
          });
        }

        // Check for unreasonably high volume (configurable threshold, default 5000L)
        if (existingReading) {
          const volumeSold =
            reading.closingReading - existingReading.openingReading;
          if (volumeSold > 5000) {
            return res.status(400).json({
              error: `This volume (${volumeSold}L) seems unusually high. Are you sure?`,
              code: "HIGH_VOLUME_WARNING",
              volume: volumeSold,
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

      const cashSales =
        cashSalesResult.find((s) => s.paymentType === "cash")?._sum
          ?.totalAmount || 0;
      const cardSales =
        cashSalesResult.find((s) => s.paymentType === "card")?._sum
          ?.totalAmount || 0;
      const mpesaSales =
        cashSalesResult.find((s) => s.paymentType === "mpesa")?._sum
          ?.totalAmount || 0;

      const expectedCash = parseFloat(shift.startCash) + parseFloat(cashSales);
      const variance = parseFloat(closing_balance) - expectedCash;

      // Update nozzle readings with closing values
      if (nozzleReadings && Array.isArray(nozzleReadings)) {
        for (const reading of nozzleReadings) {
          const existingReading = shift.nozzleShiftReadings.find(
            (nr) => nr.nozzleId === reading.nozzleId,
          );

          if (existingReading) {
            const volumeSold =
              parseFloat(reading.closingReading) -
              parseFloat(existingReading.openingReading);
            const nozzle = await tx.nozzle.findUnique({
              where: { id: reading.nozzleId },
            });
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

      return await tx.shiftRegister.update({
        where: { id: shift.id },
        data: {
          endTime: new Date(),
          endCash: parseFloat(closing_balance),
          expectedCash: expectedCash,
          actualCash: parseFloat(closing_balance),
          variance: variance,
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
      },
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

// GET /api/shifts/analytics - Dashboard analytics for shift metrics
router.get("/analytics", async (req, res) => {
  try {
    const { startDate, endDate, shopId: queryShopId } = req.query;
    const shopId = queryShopId || req.user.shop_id;

    const start =
      startDate ?
        new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
          include: { nozzle: true },
        },
      },
      orderBy: { startTime: "desc" },
    });

    // Calculate totals
    const totalCashSales = shifts.reduce(
      (sum, s) => sum + (parseFloat(s.totalCashSales) || 0),
      0,
    );
    const totalCardSales = shifts.reduce(
      (sum, s) => sum + (parseFloat(s.totalCardSales) || 0),
      0,
    );
    const totalMpesaSales = shifts.reduce(
      (sum, s) => sum + (parseFloat(s.totalMpesaSales) || 0),
      0,
    );
    const totalVariance = shifts.reduce(
      (sum, s) => sum + (parseFloat(s.variance) || 0),
      0,
    );

    // Get fuel distribution from nozzle readings
    const fuelDistribution = {};
    for (const shift of shifts) {
      for (const reading of shift.nozzleShiftReadings) {
        const fuelType = reading.nozzle?.fuelType || "petrol";
        if (!fuelDistribution[fuelType]) {
          fuelDistribution[fuelType] = { volume: 0, amount: 0 };
        }
        fuelDistribution[fuelType].volume +=
          parseFloat(reading.volumeSold) || 0;
        fuelDistribution[fuelType].amount +=
          parseFloat(reading.amountSold) || 0;
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
      status:
        (s.variance || 0) === 0 ? "balanced"
        : s.variance > 0 ? "surplus"
        : "shortage",
    }));

    res.json({
      totalSales: totalCashSales + totalCardSales + totalMpesaSales,
      totalVolume: Object.values(fuelDistribution).reduce(
        (sum, f) => sum + f.volume,
        0,
      ),
      totalVariance,
      shiftCount: shifts.length,
      salesTrends: Object.entries(dailySales).map(([date, data]) => ({
        date,
        ...data,
      })),
      varianceData,
      fuelDistribution: Object.entries(fuelDistribution).map(
        ([fuelType, data]) => ({
          fuelType,
          volume: data.volume,
          amount: data.amount,
          percentage:
            (data.volume /
              (Object.values(fuelDistribution).reduce(
                (s, f) => s + f.volume,
                0,
              ) || 1)) *
            100,
        }),
      ),
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
