const express = require("express");
const prisma = require("../prisma/client");
const {
  authenticateToken,
  requireAdmin,
  requireRole,
} = require("../middleware/auth");

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
router.post("/assign", requireRole(["admin"]), async (req, res) => {
  try {
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
    // Handle literal "undefined" string that might be sent by frontend hooks
    const shopId =
      queryShopId && queryShopId !== "undefined" ?
        queryShopId
      : req.user.shop_id;

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
router.post("/pumps", requireAdmin, async (req, res) => {
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

    // Sync nozzle prices with Inventory items
    const nozzleUpdates = nozzles.map((n) =>
      prisma.item.updateMany({
        where: {
          shopId: shopId,
          category: "Fuel",
          name: { contains: n.fuelType, mode: "insensitive" },
        },
        data: { sellingPrice: parseFloat(n.unitPrice) },
      }),
    );

    await Promise.all(nozzleUpdates);

    res.status(201).json(pump);
  } catch (err) {
    console.error("Create pump error:", err);
    res.status(500).json({ error: "Failed to create pump." });
  }
});

// PUT /api/shifts/pumps/:id - Update a pump and its nozzles
router.put("/pumps/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, pumpNumber, nozzles } = req.body;
    const shopId = req.user.shop_id;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Pump metadata
      const existingPump = await tx.pump.findFirst({
        where: { id, shopId },
      });

      if (!existingPump) {
        throw new Error("Pump not found or unauthorized.");
      }

      const pump = await tx.pump.update({
        where: { id },
        data: {
          name,
          pumpNumber: parseInt(pumpNumber),
        },
      });

      // 2. Handle nozzles
      const nozzleIdsToKeep = nozzles.filter((n) => n.id).map((n) => n.id);

      // Soft delete removed nozzles
      await tx.nozzle.updateMany({
        where: {
          pumpId: id,
          id: { notIn: nozzleIdsToKeep },
        },
        data: { isActive: false },
      });

      // Update or create nozzles
      for (const n of nozzles) {
        if (n.id) {
          await tx.nozzle.update({
            where: { id: n.id },
            data: {
              nozzleNumber: parseInt(n.nozzleNumber),
              fuelType: n.fuelType,
              unitPrice: parseFloat(n.unitPrice),
              isActive: true,
            },
          });
        } else {
          await tx.nozzle.create({
            data: {
              pumpId: id,
              nozzleNumber: parseInt(n.nozzleNumber),
              fuelType: n.fuelType,
              unitPrice: parseFloat(n.unitPrice),
              isActive: true,
            },
          });
        }

        // 3. Price Synchronization Logic (Sync with Inventory)
        const fuelItem = await tx.item.findFirst({
          where: {
            shopId,
            category: { equals: "Fuel", mode: "insensitive" },
            name: { equals: n.fuelType, mode: "insensitive" },
          },
        });

        if (fuelItem) {
          await tx.item.update({
            where: { id: fuelItem.id },
            data: { sellingPrice: parseFloat(n.unitPrice) },
          });
        }
      }

      return await tx.pump.findUnique({
        where: { id },
        include: { nozzles: { where: { isActive: true } } },
      });
    });

    res.json(result);
  } catch (err) {
    console.error("Update pump error:", err);
    res.status(500).json({ error: "Failed to update pump." });
  }
});

// DELETE /api/shifts/pumps/:id - Soft delete a pump
router.delete("/pumps/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.user.shop_id;

    await prisma.$transaction([
      prisma.pump.updateMany({
        where: { id, shopId },
        data: { isActive: false },
      }),
      prisma.nozzle.updateMany({
        where: { pumpId: id },
        data: { isActive: false },
      }),
    ]);

    res.status(204).send();
  } catch (err) {
    console.error("Delete pump error:", err);
    res.status(500).json({ error: "Failed to delete pump." });
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
