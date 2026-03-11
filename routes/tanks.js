const express = require("express");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const prisma = require("../prisma/client");

const router = express.Router();
router.use(authenticateToken);

// GET /api/tanks - Get all tanks for the current shop
router.get("/", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const tanks = await prisma.tank.findMany({
      where: { shopId },
      include: {
        pumps: true, // Show connected pumps
      },
      orderBy: { name: "asc" },
    });
    res.json(tanks);
  } catch (err) {
    console.error("Fetch tanks error:", err);
    res.status(500).json({ error: "Failed to fetch tanks." });
  }
});

// GET /api/tanks/:id - Get a single tank by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.user.shop_id;

    const tank = await prisma.tank.findFirst({
      where: { id, shopId },
      include: {
        pumps: true,
      },
    });

    if (!tank) {
      return res.status(404).json({ error: "Tank not found." });
    }

    res.json(tank);
  } catch (err) {
    console.error("Fetch tank error:", err);
    res.status(500).json({ error: "Failed to fetch tank." });
  }
});

// POST /api/tanks - Create a new tank
router.post("/", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      fuelType,
      capacity,
      currentLevel,
      currentPrice,
      minStockLevel,
    } = req.body;
    const shopId = req.user.shop_id;

    if (!name || !fuelType || capacity == null || currentPrice == null) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const newTank = await prisma.tank.create({
      data: {
        name,
        fuelType: fuelType.toLowerCase(),
        capacity: parseFloat(capacity),
        currentLevel: parseFloat(currentLevel || 0),
        currentPrice: parseFloat(currentPrice),
        minStockLevel: parseFloat(minStockLevel || 0),
        shopId,
      },
    });

    res.status(201).json(newTank);
  } catch (err) {
    console.error("Create tank error:", err);
    res.status(500).json({ error: "Failed to create tank." });
  }
});

// PUT /api/tanks/:id - Update an existing tank
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, fuelType, capacity, currentPrice, minStockLevel } = req.body;
    const shopId = req.user.shop_id;

    const tank = await prisma.tank.findFirst({
      where: { id, shopId },
    });

    if (!tank) {
      return res.status(404).json({ error: "Tank not found." });
    }

    const updatedTank = await prisma.tank.update({
      where: { id },
      data: {
        name: name !== undefined ? name : tank.name,
        fuelType:
          fuelType !== undefined ? fuelType.toLowerCase() : tank.fuelType,
        capacity: capacity !== undefined ? parseFloat(capacity) : tank.capacity,
        currentPrice:
          currentPrice !== undefined ?
            parseFloat(currentPrice)
          : tank.currentPrice,
        minStockLevel:
          minStockLevel !== undefined ?
            parseFloat(minStockLevel)
          : tank.minStockLevel,
        // currentLevel is typically updated via refills or sales, not direct PUT
      },
    });

    res.json(updatedTank);
  } catch (err) {
    console.error("Update tank error:", err);
    res.status(500).json({ error: "Failed to update tank." });
  }
});

// DELETE /api/tanks/:id - Delete a tank
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.user.shop_id;

    const tank = await prisma.tank.findFirst({
      where: { id, shopId },
      include: { pumps: true },
    });

    if (!tank) {
      return res.status(404).json({ error: "Tank not found." });
    }

    if (tank.pumps.length > 0) {
      return res
        .status(400)
        .json({
          error: "Cannot delete tank with attached pumps. Remove pumps first.",
        });
    }

    await prisma.tank.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (err) {
    console.error("Delete tank error:", err);
    res.status(500).json({ error: "Failed to delete tank." });
  }
});

module.exports = router;
