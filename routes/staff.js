const express = require("express");
const prisma = require("../prisma/client");
const { clerkClient } = require("@clerk/express");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/staff
 * Get all staff members for the current user's shop
 * Admin: sees all staff
 * Staff: sees only themselves
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { shop_id, role, id: userId } = req.user;

    // Build query - users can only see staff from their own shop
    const where = { shopId: shop_id };

    // Staff can only see themselves, admin sees all
    if (role !== "admin") {
      where.id = userId;
    }

    const staff = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        shopId: true,
        shopName: true,
        clerkUserId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(staff);
  } catch (error) {
    console.error("Get staff error:", error);
    res.status(500).json({
      error: "Failed to retrieve staff members.",
      code: "SERVER_ERROR",
    });
  }
});

/**
 * POST /api/staff
 * Create a new staff member (Admin only)
 * The staff member will be linked to their Clerk account on first login
 * Error codes:
 * - EMAIL_EXISTS: Email already in use (P2002)
 * - USERNAME_EXISTS: Username already taken (P2002)
 * - VALIDATION_ERROR: Missing required fields
 * - ADMIN_REQUIRED: User is not an admin
 */
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, fullName, phone } = req.body;
    const { shop_id, shop_name } = req.user;

    // Validation
    if (!username || username.trim().length === 0) {
      return res.status(400).json({
        error: "Username is required.",
        code: "VALIDATION_ERROR",
        field: "username",
      });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Valid email is required.",
        code: "VALIDATION_ERROR",
        field: "email",
      });
    }

    if (!fullName || fullName.trim().length === 0) {
      return res.status(400).json({
        error: "Full name is required.",
        code: "VALIDATION_ERROR",
        field: "fullName",
      });
    }

    // Create staff member
    const staff = await prisma.user.create({
      data: {
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        phone: phone?.trim() || null,
        passwordHash: "CLERK_AUTH", // Will be authenticated via Clerk
        role: "staff",
        shopId: shop_id,
        shopName: shop_name,
        clerkUserId: null, // Will be linked on first login
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        shopId: true,
        shopName: true,
        clerkUserId: true,
        createdAt: true,
      },
    });

    // Send Clerk invitation email so the staff member can sign in
    let inviteSent = false;
    try {
      await clerkClient.invitations.createInvitation({
        emailAddress: email,
        redirectUrl:
          process.env.CLIENT_ORIGIN?.split(",")[0]?.trim() ||
          "http://localhost:5173",
      });
      inviteSent = true;
      console.log(`\u2709\ufe0f  Clerk invitation sent to ${email}`);
    } catch (inviteErr) {
      // Non-fatal: staff exists in DB. Likely email already has a Clerk account
      console.warn(
        `Could not send Clerk invite to ${email}:`,
        inviteErr?.errors?.[0]?.message || inviteErr?.message,
      );
    }

    res.status(201).json({
      message:
        inviteSent ?
          `Staff member created. An invitation email has been sent to ${email}.`
        : `Staff member created. Ask ${fullName} to sign in with ${email} (account may already exist).`,
      staff,
      inviteSent,
    });
  } catch (error) {
    console.error("Create staff error:", error);

    // Handle unique constraint violations
    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];

      if (field === "email") {
        return res.status(409).json({
          error: "A user with this email already exists.",
          code: "EMAIL_EXISTS",
          field: "email",
        });
      }

      if (field === "username") {
        return res.status(409).json({
          error: "This username is already taken.",
          code: "USERNAME_EXISTS",
          field: "username",
        });
      }

      return res.status(409).json({
        error: "Duplicate entry detected.",
        code: "DUPLICATE_ENTRY",
        field,
      });
    }

    res.status(500).json({
      error: "Failed to create staff member. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

/**
 * GET /api/staff/:id
 * Get a specific staff member
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { shop_id, role, id: userId } = req.user;

    // Staff can only view themselves
    if (role !== "admin" && parseInt(id) !== userId) {
      return res.status(403).json({
        error: "Access denied. You can only view your own profile.",
        code: "ACCESS_DENIED",
      });
    }

    const staff = await prisma.user.findFirst({
      where: {
        id: parseInt(id),
        shopId: shop_id, // Can only view staff from same shop
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        shopId: true,
        shopName: true,
        clerkUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!staff) {
      return res.status(404).json({
        error: "Staff member not found.",
        code: "STAFF_NOT_FOUND",
      });
    }

    res.json(staff);
  } catch (error) {
    console.error("Get staff member error:", error);
    res.status(500).json({
      error: "Failed to retrieve staff member.",
      code: "SERVER_ERROR",
    });
  }
});

/**
 * PATCH /api/staff/:id
 * Update a staff member (Admin only)
 * Can update role, phone, etc.
 */
router.patch("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, role } = req.body;
    const { shop_id } = req.user;

    // Validate role if provided
    if (role && !["admin", "staff"].includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Must be 'admin' or 'staff'.",
        code: "VALIDATION_ERROR",
        field: "role",
      });
    }

    // Build update data
    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (role !== undefined) updateData.role = role;

    const staff = await prisma.user.updateMany({
      where: {
        id: parseInt(id),
        shopId: shop_id, // Can only update staff from same shop
      },
      data: updateData,
    });

    if (staff.count === 0) {
      return res.status(404).json({
        error: "Staff member not found.",
        code: "STAFF_NOT_FOUND",
      });
    }

    // Fetch updated staff
    const updatedStaff = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        shopId: true,
        shopName: true,
        clerkUserId: true,
        updatedAt: true,
      },
    });

    res.json({
      message: "Staff member updated successfully.",
      staff: updatedStaff,
    });
  } catch (error) {
    console.error("Update staff error:", error);
    res.status(500).json({
      error: "Failed to update staff member.",
      code: "SERVER_ERROR",
    });
  }
});

/**
 * DELETE /api/staff/:id
 * Remove a staff member (Admin only)
 * Cannot delete yourself
 */
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { shop_id, id: userId } = req.user;

    const staffId = parseInt(id);

    // Prevent admin from deleting themselves
    if (staffId === userId) {
      return res.status(400).json({
        error: "You cannot delete your own account.",
        code: "SELF_DELETE_NOT_ALLOWED",
      });
    }

    const result = await prisma.user.deleteMany({
      where: {
        id: staffId,
        shopId: shop_id, // Can only delete staff from same shop
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        error: "Staff member not found.",
        code: "STAFF_NOT_FOUND",
      });
    }

    res.json({
      message: "Staff member removed successfully.",
    });
  } catch (error) {
    console.error("Delete staff error:", error);
    res.status(500).json({
      error: "Failed to remove staff member.",
      code: "SERVER_ERROR",
    });
  }
});

module.exports = router;
