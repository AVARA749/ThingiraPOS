const express = require("express");
const prisma = require("../prisma/client");
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
        { barcode: { contains: q, mode: "insensitive" } },
        {
          category: {
            name: { contains: q, mode: "insensitive" },
          },
        },
      ];
    }

    if (category) {
      where.categoryId = category;
    }

    // Role-based isolation: POS/General users shouldn't see Fuel items
    // Unless explicitly requested (e.g., admin setup)
    if (req.query.pos === "true") {
      where.category = {
        name: { not: "Fuel" },
      };
    }

    if (low_stock === "true") {
      where.quantity = {
        lte: prisma.item.min_stock_level,
      };
    }

    let items = await prisma.item.findMany({
      where,
      include: {
        supplier: {
          select: { name: true },
        },
        category: {
          select: { name: true, id: true },
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
        category_name: i.category?.name || "General",
        buying_price: parseFloat(i.buyingPrice),
        selling_price: parseFloat(i.sellingPrice),
        quantity: parseFloat(i.quantity),
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
    const categories = await prisma.category.findMany({
      where: { shopId: req.user.shop_id },
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { name: "asc" },
    });
    res.json(
      categories.map((c) => ({
        ...c,
        itemCount: c._count.items,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories." });
  }
});

// POST /api/items/categories
router.post("/categories", async (req, res) => {
  try {
    const { name } = req.body;
    const shopId = req.user.shop_id;

    if (!name) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        shopId,
      },
    });

    res.status(201).json(category);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ error: "A category with this name already exists." });
    }
    res.status(500).json({ error: "Failed to create category." });
  }
});

// PUT /api/items/categories/:id
router.put("/categories/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const shopId = req.user.shop_id;

    const category = await prisma.category.updateMany({
      where: {
        id: req.params.id,
        shopId,
      },
      data: {
        name: name.trim(),
      },
    });

    if (category.count === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    const updated = await prisma.category.findUnique({
      where: { id: req.params.id },
    });

    res.json(updated);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ error: "A category with this name already exists." });
    }
    res.status(500).json({ error: "Failed to update category." });
  }
});

// DELETE /api/items/categories/:id
router.delete("/categories/:id", async (req, res) => {
  try {
    const shopId = req.user.shop_id;
    const categoryId = req.params.id;

    // Check if category has items
    const itemCount = await prisma.item.count({
      where: { categoryId, shopId },
    });

    if (itemCount > 0) {
      return res.status(400).json({
        error: "Cannot delete category that contains items. Move the items first.",
      });
    }

    const result = await prisma.category.deleteMany({
      where: { id: categoryId, shopId },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    res.json({ success: true, message: "Category deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete category." });
  }
});

// GET /api/items/:id
router.get("/:id", async (req, res) => {
  try {
    const item = await prisma.item.findFirst({
      where: {
        id: req.params.id,
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
      category_name: item.category?.name || "General",
      buying_price: parseFloat(item.buyingPrice),
      selling_price: parseFloat(item.sellingPrice),
      quantity: parseFloat(item.quantity),
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
      category_id,
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
        categoryId: category_id || null,
        barcode: barcode || null,
      },
    });

    if (quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          shopId,
          userId: req.user.id,
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
      category_name: item.category?.name || "General",
      buying_price: parseFloat(item.buyingPrice),
      selling_price: parseFloat(item.sellingPrice),
      quantity: parseFloat(item.quantity),
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
      category_id,
      barcode,
    } = req.body;
    const itemId = req.params.id;
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

    const currentQty = parseFloat(existing.quantity);
    const newQty = quantity !== undefined ? parseFloat(quantity) : currentQty;
    const qtyDiff = newQty - currentQty;

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        name: name || undefined,
        buyingPrice: buying_price !== undefined ? buying_price : undefined,
        sellingPrice: selling_price !== undefined ? selling_price : undefined,
        quantity: quantity !== undefined ? parseFloat(quantity) : undefined,
        minStockLevel:
          min_stock_level !== undefined ? min_stock_level : undefined,
        supplierId: supplier_id !== undefined ? supplier_id : undefined,
        categoryId: category_id || undefined,
        barcode: barcode || undefined,
      },
    });

    if (qtyDiff !== 0) {
      await prisma.stockMovement.create({
        data: {
          shopId,
          userId: req.user.id,
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
    const itemId = req.params.id;
    const shopId = req.user.shop_id;

    const item = await prisma.item.findFirst({
      where: { id: itemId, shopId: shopId },
    });
    if (!item) return res.status(404).json({ error: "Item not found." });

    const hasSales = await prisma.saleItem.count({
      where: { itemId: itemId, shopId: shopId },
    });
    if (hasSales > 0) {
      return res.status(400).json({
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
