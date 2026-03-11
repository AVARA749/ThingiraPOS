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
        pumpShiftReadings: {
          include: {
            pump: true,
          },
        },
      },
    });

    // Get all pumps with their baseline readings
    const pumps = await prisma.pump.findMany({
      where: { shopId, isActive: true },
      orderBy: { pumpNumber: "asc" },
    });

    if (shift) {
      return res.json({ isOpen: true, shift, pumps });
    }

    // If no open shift, check for assigned shifts
    const assignedShifts = await prisma.shiftRegister.findMany({
      where: { shopId, userId, status: "assigned" },
      orderBy: { createdAt: "desc" },
      include: {
        shift: true,
      },
    });

    res.json({ isOpen: false, assignedShifts, pumps });
  } catch (err) {
    console.error("Shift status error:", err);
    res.status(500).json({ error: "Failed to check shift status." });
  }
});

// GET /api/shifts/slots - Get all shift slot definitions
router.get("/slots", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const slots = await prisma.shift.findMany({
      where: { shopId },
      orderBy: { startTime: "asc" },
    });
    res.json(slots);
  } catch (err) {
    console.error("Fetch slots error:", err);
    res.status(500).json({ error: "Failed to fetch shift slots." });
  }
});

// POST /api/shifts/slots - Create shift slot
router.post("/slots", requireRole(["admin"]), async (req, res) => {
  try {
    const { name, startTime, endTime } = req.body;
    const shopId = req.user.shop_id;

    const slot = await prisma.shift.create({
      data: {
        name,
        startTime,
        endTime,
        shopId,
      },
    });
    res.status(201).json(slot);
  } catch (err) {
    console.error("Create slot error:", err);
    res.status(500).json({ error: "Failed to create shift slot." });
  }
});

// DELETE /api/shifts/slots/:id - Delete shift slot
router.delete("/slots/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.shift.delete({
      where: { id },
    });
    res.json({ message: "Slot deleted." });
  } catch (err) {
    console.error("Delete slot error:", err);
    res.status(500).json({ error: "Failed to delete shift slot." });
  }
});

// POST /api/shifts/assign - Admin pre-assigns a shift to a staff member
router.post("/assign", requireRole(["admin"]), async (req, res) => {
  try {
    const { userId, notes, shiftId } = req.body;
    const shopId = req.user.shop_id;

    const shift = await prisma.shiftRegister.create({
      data: {
        shopId,
        userId,
        shiftId,
        openingNotes: notes || "", // Stored in openingNotes for consistency
        status: "assigned",
      },
      include: {
        shift: true,
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
    const { opening_balance, notes, pumpReadings, shiftId } = req.body;
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
            openingNotes: notes || undefined,
          },
        });
      } else {
        // Opening an ad-hoc shift
        shift = await tx.shiftRegister.create({
          data: {
            shopId,
            userId,
            startCash: parseFloat(opening_balance || 0),
            openingNotes: notes || "",
            status: "open",
            startTime: new Date(),
          },
        });
      }

      // If pump readings provided, create them
      if (
        pumpReadings &&
        Array.isArray(pumpReadings) &&
        pumpReadings.length > 0
      ) {
        for (const reading of pumpReadings) {
          await tx.pumpShiftReading.create({
            data: {
              shiftId: shift.id,
              pumpId: reading.pumpId,
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

// POST /api/shifts/close - Close shift with validation and reconciliation
router.post("/close", async (req, res) => {
  try {
    const {
      actual_cash, // Physical cash counted
      total_cash_sales,
      total_mpesa_sales,
      total_card_sales,
      total_credit_sales,
      notes,
      pumpReadings,
      skipMeterValidation,
    } = req.body;

    const shopId = req.user.shop_id;
    const userId = req.user.id;

    const shift = await prisma.shiftRegister.findFirst({
      where: { shopId, userId, status: "open" },
      orderBy: { startTime: "desc" },
      include: {
        pumpShiftReadings: {
          include: { pump: true },
        },
      },
    });

    if (!shift) {
      return res.status(404).json({ error: "No open shift found." });
    }

    // 1. Validate pump readings if provided
    if (pumpReadings && Array.isArray(pumpReadings) && !skipMeterValidation) {
      for (const reading of pumpReadings) {
        const existingReading = shift.pumpShiftReadings.find(
          (pr) => pr.pumpId === reading.pumpId,
        );

        if (
          existingReading &&
          parseFloat(reading.closingReading) <
            parseFloat(existingReading.openingReading)
        ) {
          return res.status(400).json({
            error: `Meter rollback detected for pump ${reading.pumpId}. Please verify reading.`,
            code: "METER_ROLLBACK",
          });
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let totalMeteredRevenue = 0;

      // 2. Update pump readings and calculate metered revenue
      if (pumpReadings && Array.isArray(pumpReadings)) {
        for (const reading of pumpReadings) {
          const existingReading = shift.pumpShiftReadings.find(
            (pr) => pr.pumpId === reading.pumpId,
          );

          if (existingReading) {
            const pump = await tx.pump.findUnique({
              where: { id: reading.pumpId },
            });
            const volumeSold =
              parseFloat(reading.closingReading) -
              parseFloat(existingReading.openingReading);
            const amountSold = volumeSold * parseFloat(pump.unitPrice);
            totalMeteredRevenue += amountSold;

            await tx.pumpShiftReading.update({
              where: { id: existingReading.id },
              data: {
                closingReading: parseFloat(reading.closingReading),
                closingTime: new Date(),
                volumeSold,
                amountSold,
              },
            });

            // Update baseline meter for next shift
            await tx.pump.update({
              where: { id: reading.pumpId },
              data: { lastReading: parseFloat(reading.closingReading) },
            });

            // INTEGRATION: Decrement Fuel Inventory from Tank
            if (pump.tankId) {
              const updatedTank = await tx.tank.update({
                where: { id: pump.tankId },
                data: { currentLevel: { decrement: volumeSold } },
              });

              // Log Stock Movement for Tank
              await tx.stockMovement.create({
                data: {
                  shopId,
                  userId,
                  tankId: pump.tankId,
                  tankName: updatedTank.name,
                  movementType: "OUT",
                  quantity: volumeSold,
                  balanceAfter: updatedTank.currentLevel,
                  referenceType: "shift_dispense",
                  referenceId: shift.id,
                  notes: `Dispensed via ${pump.name} - Shift ${shift.id}`,
                },
              });
            }
          }
        }
      }

      // 3. Reconciliation Logic
      const declaredTotal =
        parseFloat(total_cash_sales || 0) +
        parseFloat(total_mpesa_sales || 0) +
        parseFloat(total_card_sales || 0) +
        parseFloat(total_credit_sales || 0);

      // Validation check: Metered vs Declared
      // Note: We'll allow closing but record the discrepancy if needed.
      // For strict validation, return error if they don't match.
      // const tolerance = 0.01;
      // if (Math.abs(totalMeteredRevenue - declaredTotal) > tolerance) { ... }

      const expectedCashInDrawer =
        parseFloat(shift.startCash || 0) + parseFloat(total_cash_sales || 0);
      const variance = parseFloat(actual_cash || 0) - expectedCashInDrawer;

      // Create aggregate Sales records to populate dashboards
      const payments = [
        { type: "cash", amount: total_cash_sales },
        { type: "mpesa", amount: total_mpesa_sales },
        { type: "card", amount: total_card_sales },
        { type: "credit", amount: total_credit_sales },
      ];

      for (const p of payments) {
        const amt = parseFloat(p.amount || 0);
        if (amt > 0) {
          await tx.sale.create({
            data: {
              shopId,
              userId,
              shiftId: shift.id,
              totalAmount: amt,
              paymentType: p.type,
              status: "completed",
              notes: `Aggregate ${p.type} sales for shift ${shift.id}`,
            },
          });
        }
      }

      return await tx.shiftRegister.update({
        where: { id: shift.id },
        data: {
          endTime: new Date(),
          status: "closed",
          closingNotes: notes || undefined,
          expectedRevenue: totalMeteredRevenue,
          actualCash: parseFloat(actual_cash || 0),
          totalCashSales: parseFloat(total_cash_sales || 0),
          totalMpesaSales: parseFloat(total_mpesa_sales || 0),
          totalCardSales: parseFloat(total_card_sales || 0),
          totalCreditSales: parseFloat(total_credit_sales || 0),
          variance: variance,
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
    const isStaff = req.user.role !== "admin";
    const shopId = req.user.shop_id;
    const shifts = await prisma.shiftRegister.findMany({
      where: {
        shopId,
        ...(isStaff ? { userId: req.user.id } : {}),
      },
      include: {
        user: { select: { fullName: true } },
        shift: true,
      },
      orderBy: { startTime: "desc" },
      take: 100,
    });

    res.json(
      shifts.map((s) => ({
        ...s,
        userName: s.user?.fullName || "Unknown",
        user_name: s.user?.fullName || "Unknown", // Temporary compatibility
      })),
    );
  } catch (err) {
    console.error("Shift history error:", err);
    res.status(500).json({ error: "Failed to fetch shift history." });
  }
});

// GET /api/shifts/analytics - Dashboard analytics for fuel metrics
router.get("/analytics", async (req, res) => {
  try {
    const { startDate, endDate, shopId: queryShopId, fuelTypes } = req.query;
    const shopId =
      queryShopId && queryShopId !== "undefined" ?
        queryShopId
      : req.user.shop_id;

    // Parse fuelTypes if provided (comma-separated string)
    const fuelTypesArray =
      fuelTypes ?
        typeof fuelTypes === "string" ?
          fuelTypes.split(",")
        : fuelTypes
      : [];

    const start =
      startDate ?
        new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const isStaff = req.user.role !== "admin";

    // Get shifts in date range
    const shifts = await prisma.shiftRegister.findMany({
      where: {
        shopId,
        status: "closed",
        startTime: { gte: start, lte: end },
        ...(isStaff ? { userId: req.user.id } : {}),
      },
      include: {
        user: { select: { fullName: true } },
        pumpShiftReadings: {
          include: { pump: true },
        },
      },
      orderBy: { startTime: "desc" },
    });

    // Filter by fuel types if specified
    const filteredShifts =
      fuelTypesArray.length > 0 ?
        shifts.filter((s) =>
          s.pumpShiftReadings.some(
            (r) =>
              r.pump && fuelTypesArray.includes(r.pump.fuelType.toLowerCase()),
          ),
        )
      : shifts;

    // Calculate totals from shift registers
    const totalCashSales = filteredShifts.reduce(
      (sum, s) => sum + (parseFloat(s.totalCashSales) || 0),
      0,
    );
    const totalCardSales = filteredShifts.reduce(
      (sum, s) => sum + (parseFloat(s.totalCardSales) || 0),
      0,
    );
    const totalMpesaSales = filteredShifts.reduce(
      (sum, s) => sum + (parseFloat(s.totalMpesaSales) || 0),
      0,
    );
    const totalCreditSales = filteredShifts.reduce(
      (sum, s) => sum + (parseFloat(s.totalCreditSales) || 0),
      0,
    );
    const totalVariance = filteredShifts.reduce(
      (sum, s) => sum + (parseFloat(s.variance) || 0),
      0,
    );

    // Get fuel distribution from pump readings
    const fuelDistribution = {};
    for (const shift of filteredShifts) {
      for (const reading of shift.pumpShiftReadings) {
        const fuelType = reading.pump?.fuelType || "petrol";
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
    for (const shift of filteredShifts) {
      const date = new Date(shift.startTime).toISOString().split("T")[0];
      if (!dailySales[date]) {
        dailySales[date] = { petrol: 0, diesel: 0, kerosene: 0, total: 0 };
      }

      for (const reading of shift.pumpShiftReadings || []) {
        const fuelType = reading.pump?.fuelType || "petrol";
        const amount = parseFloat(reading.amountSold) || 0;
        if (dailySales[date][fuelType] !== undefined) {
          dailySales[date][fuelType] += amount;
        }
        dailySales[date].total += amount;
      }
    }

    res.json({
      totalSales:
        totalCashSales + totalCardSales + totalMpesaSales + totalCreditSales,
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

// GET /api/shifts/pumps - Get all pumps for the shop
router.get("/pumps", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const pumps = await prisma.pump.findMany({
      where: { shopId, isActive: true },
      include: { tank: true },
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
    const { name, pumpNumber, fuelType, unitPrice, tankId } = req.body;
    const shopId = req.user.shop_id;

    const pump = await prisma.pump.create({
      data: {
        shopId,
        name,
        pumpNumber: parseInt(pumpNumber),
        fuelType,
        unitPrice: parseFloat(unitPrice) || 0,
        tankId: tankId || undefined,
        isActive: true,
      },
    });

    res.status(201).json(pump);
  } catch (err) {
    console.error("Create pump error:", err);
    res.status(500).json({ error: "Failed to create pump." });
  }
});

// PUT /api/shifts/pumps/:id - Update a pump
router.put("/pumps/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, pumpNumber, fuelType, unitPrice, itemId } = req.body;
    const shopId = req.user.shop_id;

    const result = await prisma.$transaction(async (tx) => {
      const pump = await tx.pump.update({
        where: { id, shopId },
        data: {
          name,
          pumpNumber: parseInt(pumpNumber),
          fuelType,
          unitPrice: parseFloat(unitPrice) || 0,
          itemId: itemId || undefined,
        },
      });

      // Price Synchronization Logic (Sync with Inventory)
      if (pump.itemId) {
        await tx.item.update({
          where: { id: pump.itemId },
          data: { sellingPrice: parseFloat(unitPrice) },
        });
      }

      return pump;
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

    await prisma.pump.update({
      where: { id, shopId },
      data: { isActive: false },
    });

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
        pumpShiftReadings: {
          include: { pump: true },
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

// POST /api/shifts/pumps/:id/calibrate - Admin manually sets meter baseline
router.post("/pumps/:id/calibrate", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { lastReading } = req.body;
    const shopId = req.user.shop_id;

    const pump = await prisma.pump.update({
      where: { id, shopId },
      data: { lastReading: parseFloat(lastReading) },
    });

    res.json({
      message: "Pump calibrated successfully.",
      lastReading: pump.lastReading,
    });
  } catch (err) {
    console.error("Calibrate pump error:", err);
    res.status(500).json({ error: "Failed to calibrate pump." });
  }
});

// POST /api/shifts/refill - Admin records a fuel delivery/refill
router.post("/refill", requireAdmin, async (req, res) => {
  try {
    const { fuelType, volume, totalCost, supplierId, notes } = req.body;
    const shopId = req.user.shop_id;
    const userId = req.user.id;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find the fuel tank by fuelType
      const tank = await tx.tank.findFirst({
        where: {
          shopId,
          fuelType: { equals: fuelType, mode: "insensitive" },
        },
      });

      if (!tank) {
        throw new Error(`Fuel tank for ${fuelType} not found in inventory.`);
      }

      const updatedTank = await tx.tank.update({
        where: { id: tank.id },
        data: { currentLevel: { increment: volume } }, // capacity is decimal, volume can be float
      });

      // 2. Log Stock Movement
      await tx.stockMovement.create({
        data: {
          shopId,
          userId,
          tankId: tank.id,
          tankName: tank.name,
          movementType: "IN",
          quantity: volume,
          balanceAfter: updatedTank.currentLevel,
          referenceType: "refill",
          notes: notes || `Refill: ${volume}L of ${fuelType}`,
        },
      });

      // 3. Create an Expense or Ledger entry if cost is provided
      if (totalCost && parseFloat(totalCost) > 0) {
        await tx.generalLedger.create({
          data: {
            shopId,
            userId,
            date: new Date(),
            description: `Fuel Refill Purchase - ${fuelType} (${volume}L)`,
            debit: parseFloat(totalCost),
            credit: 0,
            balance: parseFloat(totalCost),
            reference: "bulk_refill",
          },
        });
      }

      return updatedTank;
    });

    res.json({
      message: "Fuel refill recorded successfully.",
      inventory: result,
    });
  } catch (err) {
    console.error("Refill error:", err);
    res.status(500).json({ error: err.message || "Failed to record refill." });
  }
});

module.exports = router;
