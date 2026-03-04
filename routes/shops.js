const express = require("express");
const prisma = require("../prisma/client");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/shops
 * Create a new shop and set the current user as admin
 * This is the entry point for new users who sign up via Clerk
 * Error codes:
 * - SHOP_NAME_EXISTS: Shop name already taken (P2002)
 * - VALIDATION_ERROR: Missing required fields
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: "Shop name is required.",
        code: "VALIDATION_ERROR",
        field: "name"
      });
    }

    if (name.trim().length < 3) {
      return res.status(400).json({
        error: "Shop name must be at least 3 characters.",
        code: "VALIDATION_ERROR",
        field: "name"
      });
    }

    // Check if user already has a shop
    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { shopId: true }
    });

    if (existingUser?.shopId) {
      return res.status(400).json({
        error: "You already have a shop assigned.",
        code: "SHOP_EXISTS"
      });
    }

    // Create shop and update user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the shop
      const shop = await tx.shop.create({
        data: {
          name: name.trim(),
          address: address?.trim() || null,
          phone: phone?.trim() || null,
          email: email?.trim() || null,
        }
      });

      // Update user to be admin of this shop
      const user = await tx.user.update({
        where: { id: req.user.id },
        data: {
          shopId: shop.id,
          shopName: shop.name,
          role: "admin",
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          shopId: true,
          shopName: true,
        }
      });

      return { shop, user };
    });

    res.status(201).json({
      message: "Shop created successfully! You are now the admin.",
      shop: result.shop,
      user: result.user,
    });

  } catch (error) {
    console.error("Create shop error:", error);

    // Handle unique constraint violation
    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];
      if (field === "name") {
        return res.status(409).json({
          error: "A shop with this name already exists. Please choose a different name.",
          code: "SHOP_NAME_EXISTS",
          field: "name"
        });
      }
      return res.status(409).json({
        error: "Duplicate entry detected.",
        code: "DUPLICATE_ENTRY",
        field
      });
    }

    res.status(500).json({
      error: "Failed to create shop. Please try again.",
      code: "SERVER_ERROR"
    });
  }
});

/**
 * GET /api/shops/check
 * Check if the current user has a shop
 * Used by client to determine if user needs to create a shop
 */
router.get("/check", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        shopId: true,
        shopName: true,
        role: true,
      }
    });

    res.json({
      hasShop: !!user?.shopId,
      shopId: user?.shopId,
      shopName: user?.shopName,
      role: user?.role,
    });

  } catch (error) {
    console.error("Check shop error:", error);
    res.status(500).json({
      error: "Failed to check shop status.",
      code: "SERVER_ERROR"
    });
  }
});

/**
 * GET /api/shops/:id
 * Get shop details (only if user belongs to this shop)
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only access their own shop
    if (id !== req.user.shop_id) {
      return res.status(403).json({
        error: "Access denied. You can only view your own shop.",
        code: "ACCESS_DENIED"
      });
    }

    const shop = await prisma.shop.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            email: true,
            createdAt: true,
          }
        }
      }
    });

    if (!shop) {
      return res.status(404).json({
        error: "Shop not found.",
        code: "SHOP_NOT_FOUND"
      });
    }

    res.json(shop);

  } catch (error) {
    console.error("Get shop error:", error);
    res.status(500).json({
      error: "Failed to retrieve shop details.",
      code: "SERVER_ERROR"
    });
  }
});

module.exports = router;
