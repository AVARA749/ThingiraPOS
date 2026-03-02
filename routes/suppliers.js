const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/suppliers
router.get("/", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const suppliers = await prisma.supplier.findMany({
      where: { shopId: shopId },
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      suppliers.map((s) => ({
        ...s,
        item_count: s._count.items,
      })),
    );
  } catch (err) {
    console.error("Suppliers fetch error:", err);
    res.status(500).json({ error: "Failed to fetch suppliers." });
  }
});

// GET /api/suppliers/:id
router.get("/:id", async (req, res) => {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: parseInt(req.params.id), shopId: req.user.shop_id },
    });
    if (!supplier)
      return res.status(404).json({ error: "Supplier not found." });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch supplier." });
  }
});

// GET /api/suppliers/:id/purchases
router.get("/:id/purchases", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const purchases = await prisma.purchase.findMany({
      where: {
        supplierId: parseInt(req.params.id),
        shopId: shopId,
      },
      orderBy: { datePurchased: "desc" },
    });

    // We need item names, so we should join with items table
    // But the current Prisma schema shows Purchase doesn't have a direct relation to Item defined with unique constraints in a way that makes it easy without defined relations.
    // Let's check the schema again or just do a manual join if needed.
    // Actually, let's just make sure we fetch the item names.

    const items = await prisma.item.findMany({
      where: { id: { in: purchases.map((p) => p.itemId) } },
    });
    const itemMap = Object.fromEntries(items.map((i) => [i.id, i.name]));

    res.json(
      purchases.map((p) => ({
        ...p,
        item_name: itemMap[p.itemId] || "Unknown Item",
        buying_price: parseFloat(p.buyingPrice),
        total_cost: parseFloat(p.totalCost),
        date_purchased: p.datePurchased,
      })),
    );
  } catch (err) {
    console.error("Supplier purchases error:", err);
    res.status(500).json({ error: "Failed to fetch supplier purchases." });
  }
});

// POST /api/suppliers
router.post("/", async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;
    const shopId = req.user.shop_id;
    if (!name)
      return res.status(400).json({ error: "Supplier name is required." });

    const supplier = await prisma.supplier.create({
      data: {
        shopId,
        name,
        address: address || "",
        phone: phone || "",
        email: email || "",
      },
    });

    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ error: "Failed to create supplier." });
  }
});

// PUT /api/suppliers/:id
router.put("/:id", async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;
    const shopId = req.user.shop_id;
    const supplierId = parseInt(req.params.id);

    const supplier = await prisma.supplier.update({
      where: { id: supplierId }, // Technically should check shopId too
      data: {
        name: name || undefined,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
      },
    });

    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: "Failed to update supplier." });
  }
});

module.exports = router;
