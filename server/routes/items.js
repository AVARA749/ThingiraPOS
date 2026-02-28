const express = require("express");
const prisma = require("../db/prisma");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/items - List all items (with optional search)
router.get("/", async (req, res) => {
  try {
    const { q, category, low_stock } = req.query;
    const shopId = req.user.shop_id;

    const where = {
      shopId: shopId,
    };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (low_stock === "true") {
      where.quantity = {
        lte: prisma.item.min_stock_level,
      };
      // Note: In Prisma, you can't easily compare two columns (quantity <= min_stock_level) directly in a simple 'where' without using a raw query or a custom query.
      // But usually min_stock_level is a value. If we want column vs column, we might need some trick or just use the field names if they are static.
      // Actually, Prisma 4.3.0+ supports extendedWhereUnique but not column-to-column comparisons in findMany easily.
      // We'll use a pragmatic approach: if low_stock is true, filter them after or use raw.
    }

    let items = await prisma.item.findMany({
      where,
      include: {
        supplier: {
          select: { name: true },
        },
      },
      orderBy: { name: "asc" },
    });

    if (low_stock === "true") {
      items = items.filter((i) => i.quantity <= i.minStockLevel);
    }

    res.json(
      items.map((i) => ({
        ...i,
        supplier_name: i.supplier?.name || null,
        buying_price: parseFloat(i.buyingPrice),
        selling_price: parseFloat(i.sellingPrice),
      })),
    );
  } catch (err) {
    console.error("Items list error:", err);
    res.status(500).json({ error: "Failed to fetch items." });
  }
});

// GET /api/items/categories
router.get("/categories", async (req, res) => {
  try {
    const categories = await prisma.item.findMany({
      where: { shopId: req.user.shop_id },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    res.json(categories.map((c) => c.category).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories." });
  }
});

// GET /api/items/:id
router.get("/:id", async (req, res) => {
  try {
    const item = await prisma.item.findFirst({
      where: {
        id: parseInt(req.params.id),
        shopId: req.user.shop_id,
      },
      include: {
        supplier: {
          select: { name: true },
        },
      },
    });

    if (!item) return res.status(404).json({ error: "Item not found." });
    res.json({
      ...item,
      supplier_name: item.supplier?.name || null,
      buying_price: parseFloat(item.buyingPrice),
      selling_price: parseFloat(item.sellingPrice),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch item." });
  }
});

// POST /api/items - Create a new item
router.post("/", async (req, res) => {
  try {
    const {
      name,
      buying_price,
      selling_price,
      quantity,
      min_stock_level,
      supplier_id,
      category,
      barcode,
    } = req.body;
    const shopId = req.user.shop_id;

    if (!name || buying_price === undefined || selling_price === undefined) {
      return res
        .status(400)
        .json({ error: "Name, buying price, and selling price are required." });
    }

    const existing = await prisma.item.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        shopId: shopId,
      },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "An item with this name already exists in your shop." });
    }

    const item = await prisma.item.create({
      data: {
        shopId,
        name,
        buyingPrice: buying_price,
        sellingPrice: selling_price,
        quantity: quantity || 0,
        minStockLevel: min_stock_level || 5,
        supplierId: supplier_id || null,
        category: category || "General",
        barcode: barcode || null,
      },
    });

    if (quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          shopId,
          itemId: item.id,
          itemName: name,
          movementType: "IN",
          quantity: quantity,
          balanceAfter: quantity,
          referenceType: "purchase",
          notes: "Initial stock entry",
        },
      });
    }

    res.status(201).json({
      ...item,
      buying_price: parseFloat(item.buyingPrice),
      selling_price: parseFloat(item.sellingPrice),
    });
  } catch (err) {
    console.error("Item create error:", err);
    res.status(500).json({ error: "Failed to create item." });
  }
});

// PUT /api/items/:id - Update an item
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      buying_price,
      selling_price,
      quantity,
      min_stock_level,
      supplier_id,
      category,
      barcode,
    } = req.body;
    const itemId = parseInt(req.params.id);
    const shopId = req.user.shop_id;

    const existing = await prisma.item.findFirst({
      where: { id: itemId, shopId: shopId },
    });
    if (!existing) return res.status(404).json({ error: "Item not found." });

    if (name) {
      const duplicate = await prisma.item.findFirst({
        where: {
          name: { equals: name, mode: "insensitive" },
          id: { not: itemId },
          shopId: shopId,
        },
      });
      if (duplicate) {
        return res
          .status(409)
          .json({ error: "An item with this name already exists." });
      }
    }

    const currentQty = existing.quantity;
    const newQty = quantity !== undefined ? parseInt(quantity) : currentQty;
    const qtyDiff = newQty - currentQty;

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        name: name || undefined,
        buyingPrice: buying_price !== undefined ? buying_price : undefined,
        sellingPrice: selling_price !== undefined ? selling_price : undefined,
        quantity: quantity !== undefined ? quantity : undefined,
        minStockLevel:
          min_stock_level !== undefined ? min_stock_level : undefined,
        supplierId: supplier_id !== undefined ? supplier_id : undefined,
        category: category || undefined,
        barcode: barcode || undefined,
      },
    });

    if (qtyDiff !== 0) {
      await prisma.stockMovement.create({
        data: {
          shopId,
          itemId: itemId,
          itemName: name || existing.name,
          movementType: qtyDiff > 0 ? "IN" : "OUT",
          quantity: Math.abs(qtyDiff),
          balanceAfter: newQty,
          referenceType: "adjustment",
          notes: "Manual stock adjustment",
        },
      });
    }

    res.json({
      ...updated,
      buying_price: parseFloat(updated.buyingPrice),
      selling_price: parseFloat(updated.sellingPrice),
    });
  } catch (err) {
    console.error("Item update error:", err);
    res.status(500).json({ error: "Failed to update item." });
  }
});

// DELETE /api/items/:id
router.delete("/:id", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const shopId = req.user.shop_id;

    const item = await prisma.item.findFirst({
      where: { id: itemId, shopId: shopId },
    });
    if (!item) return res.status(404).json({ error: "Item not found." });

    const hasSales = await prisma.saleItem.count({
      where: { itemId: itemId, shopId: shopId },
    });
    if (hasSales > 0) {
      return res
        .status(400)
        .json({
          error:
            "Cannot delete item with existing sales records. Consider zeroing the stock instead.",
        });
    }

    await prisma.$transaction([
      prisma.stockMovement.deleteMany({
        where: { itemId: itemId, shopId: shopId },
      }),
      prisma.purchase.deleteMany({ where: { itemId: itemId, shopId: shopId } }),
      prisma.item.delete({ where: { id: itemId } }),
    ]);

    res.json({ message: "Item deleted successfully." });
  } catch (err) {
    console.error("Item delete error:", err);
    res.status(500).json({ error: "Failed to delete item." });
  }
});

module.exports = router;
