const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Helper to check if string is valid UUID
function isValidUUID(str) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// POST /api/purchases - Record stock intake
router.post("/", async (req, res) => {
  const shopId = req.user.shop_id;
  try {
    const {
      supplier_id,
      supplier_name,
      supplier_address,
      supplier_phone,
      items: purchaseItems,
    } = req.body;

    if (!purchaseItems || purchaseItems.length === 0) {
      return res.status(400).json({ error: "At least one item is required." });
    }

    // Validate supplier: must provide either valid supplier_id OR supplier_name
    if (
      (!supplier_id || supplier_id === "walk-in-supplier") &&
      !supplier_name
    ) {
      return res.status(400).json({
        error:
          "Supplier is required. Please select an existing supplier or enter a new supplier name.",
      });
    }

    // If supplier_id is provided (and not walk-in-supplier), validate it's a UUID
    if (
      supplier_id &&
      supplier_id !== "walk-in-supplier" &&
      !isValidUUID(supplier_id)
    ) {
      return res.status(400).json({
        error:
          "Invalid supplier selected. Please choose from existing suppliers.",
      });
    }

    const results = await prisma.$transaction(async (tx) => {
      let suppId = supplier_id;
      let supplierInfo = null;

      // 1. Handle Supplier logic
      // Case 1: No supplier_id or walk-in-supplier - create/find by name
      if (!suppId || suppId === "walk-in-supplier") {
        if (!supplier_name) {
          throw new Error(
            "Supplier name is required when no supplier is selected.",
          );
        }

        let supplier = await tx.supplier.findFirst({
          where: {
            name: { equals: supplier_name, mode: "insensitive" },
            shopId: shopId,
          },
        });

        if (supplier) {
          suppId = supplier.id;
          await tx.supplier.update({
            where: { id: suppId },
            data: {
              address: supplier_address || undefined,
              phone: supplier_phone || undefined,
            },
          });
        } else {
          const newSupplier = await tx.supplier.create({
            data: {
              shopId,
              name: supplier_name,
              address: supplier_address || "",
              phone: supplier_phone || "",
            },
          });
          suppId = newSupplier.id;
        }
      } else {
        // Case 2: supplier_id provided - validate it exists in this shop
        supplierInfo = await tx.supplier.findFirst({
          where: {
            id: suppId,
            shopId: shopId,
          },
        });

        if (!supplierInfo) {
          throw new Error(
            "Selected supplier not found. Please choose from existing suppliers.",
          );
        }
      }

      // Load supplier info if not already loaded
      if (!supplierInfo) {
        supplierInfo = await tx.supplier.findUnique({
          where: { id: suppId },
        });
      }

      if (!supplierInfo) {
        throw new Error("Failed to create or find supplier.");
      }
      const purchaseResults = [];

      // 2. Process each item
      for (const pi of purchaseItems) {
        let itemId = pi.item_id;
        let itemName = pi.item_name;

        if (!itemId && itemName) {
          // Try to find by name in this shop
          const existingItem = await tx.item.findFirst({
            where: {
              name: { equals: itemName, mode: "insensitive" },
              shopId: shopId,
            },
          });

          if (existingItem) {
            itemId = existingItem.id;
            // Update existing item
            await tx.item.update({
              where: { id: itemId },
              data: {
                buyingPrice: pi.buying_price,
                sellingPrice: pi.selling_price || undefined,
                quantity: { increment: pi.quantity },
                supplierId: suppId,
                categoryId: pi.category_id || undefined,
                minStockLevel: pi.min_stock_level || undefined,
              },
            });
          } else {
            // Create new item
            const newItem = await tx.item.create({
              data: {
                shopId,
                name: itemName,
                buyingPrice: pi.buying_price,
                sellingPrice: pi.selling_price || pi.buying_price * 1.3,
                quantity: pi.quantity,
                minStockLevel: pi.min_stock_level || 5,
                supplierId: suppId,
                categoryId: pi.category_id || undefined,
              },
            });
            itemId = newItem.id;
          }
        } else if (itemId) {
          const existingItem = await tx.item.findFirst({
            where: { id: itemId, shopId: shopId },
          });
          if (!existingItem) throw new Error(`Item not found: ${itemId}`);
          itemName = existingItem.name;

          await tx.item.update({
            where: { id: itemId },
            data: {
              buyingPrice: pi.buying_price,
              sellingPrice: pi.selling_price || undefined,
              quantity: { increment: pi.quantity },
              supplierId: suppId,
            },
          });
        } else {
          throw new Error(
            "Item ID or name is required for each purchase item.",
          );
        }

        const totalCost = pi.buying_price * pi.quantity;
        const datePurchased =
          pi.date_purchased ? new Date(pi.date_purchased) : new Date();

        // Create purchase record
        const purchase = await tx.purchase.create({
          data: {
            shopId,
            userId: req.user.id,
            supplierId: suppId,
            itemId: itemId,
            quantity: pi.quantity,
            buyingPrice: pi.buying_price,
            totalCost: totalCost,
            datePurchased: datePurchased,
          },
        });

        // Stock movement
        const finalItem = await tx.item.findUnique({ where: { id: itemId } });
        await tx.stockMovement.create({
          data: {
            shopId,
            userId: req.user.id,
            itemId,
            itemName,
            movementType: "IN",
            quantity: pi.quantity,
            balanceAfter: finalItem.quantity,
            referenceType: "purchase",
            referenceId: purchase.id,
            supplierName: supplierInfo.name,
            notes: "Stock purchase",
          },
        });

        // Accounting entries - Simplify or remove for now to match schema
        await tx.generalLedger.createMany({
          data: [
            {
              shopId,
              userId: req.user.id,
              date: datePurchased,
              description: `Inventory Asset - Purchase of ${itemName} from ${supplierInfo.name}`,
              debit: totalCost,
              credit: 0,
              balance: totalCost,
              reference: purchase.id,
            },
            {
              shopId,
              userId: req.user.id,
              date: datePurchased,
              description: `Cash Asset - Purchase of ${itemName} from ${supplierInfo.name}`,
              debit: 0,
              credit: totalCost,
              balance: 0,
              reference: purchase.id,
            },
          ],
        });

        purchaseResults.push({
          item_id: itemId,
          item_name: itemName,
          quantity: pi.quantity,
          purchase_id: purchase.id,
        });
      }

      return purchaseResults;
    });

    res.status(201).json({
      message: "Stock intake recorded successfully.",
      purchases: results,
    });
  } catch (err) {
    console.error("Purchase error:", err);
    res
      .status(400)
      .json({ error: err.message || "Failed to record stock purchase." });
  }
});

// GET /api/purchases
router.get("/", async (req, res) => {
  try {
    const { from, to, supplier_id } = req.query;
    const shopId = req.user.shop_id;

    const where = { shopId: shopId };

    if (from || to) {
      where.datePurchased = {};
      if (from) where.datePurchased.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.datePurchased.lte = toDate;
      }
    }

    if (supplier_id) where.supplierId = supplier_id;

    const purchases = await prisma.purchase.findMany({
      where,
      include: {
        item: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: [{ datePurchased: "desc" }, { createdAt: "desc" }],
    });

    res.json(
      purchases.map((p) => ({
        ...p,
        item_name: p.item?.name || "Unknown",
        supplier_name: p.supplier?.name || "Unknown",
        buying_price: parseFloat(p.buyingPrice),
        total_cost: parseFloat(p.totalCost),
        quantity: p.quantity,
      })),
    );
  } catch (err) {
    console.error("Fetch purchases error:", err);
    res.status(500).json({ error: "Failed to fetch purchases." });
  }
});

module.exports = router;
