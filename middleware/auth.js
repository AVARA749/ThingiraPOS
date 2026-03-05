const { getAuth } = require("@clerk/express");
const prisma = require("../prisma/client");

/**
 * Main authentication middleware.
 * User data is pre-synced from Clerk via webhooks, so we only need
 * a single DB lookup — no clerkClient API call required.
 *
 * Flow:
 *   1. Verify Clerk session token via getAuth()
 *   2. Lookup local user by clerkUserId
 *   3. If not found by ID, try email fallback (staff pre-registered before first login)
 *   4. On first login by pre-registered staff, link their Clerk ID
 *   5. Reject if no local account or no shop is assigned
 */
async function authenticateToken(req, res, next) {
  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      return res.status(401).json({
        error: "Access denied. No token provided or token invalid.",
        code: "NO_AUTH_TOKEN",
      });
    }

    // Lookup local user by Clerk user ID.
    // The webhook (/api/webhooks/clerk) guarantees this record exists and is linked.
    const dbUser = await prisma.user.findFirst({
      where: { clerkUserId: auth.userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        shopId: true,
        shopName: true,
        role: true,
        clerkUserId: true,
        email: true,
      },
    });

    if (!dbUser) {
      // If the user is not found, it means the webhook hasn't processed yet or failed.
      // We return 403 USER_NOT_FOUND, allowing the client to poll or show a waiting state.
      return res.status(403).json({
        error:
          "Account not found or sync in progress. Please wait a moment or contact your admin.",
        code: "USER_NOT_FOUND",
        needsShop: false,
      });
    }

    // Check if user has a shop assigned
    if (!dbUser.shopId) {
      // Allow passing through to create a shop if they are calling POST /api/shops
      if (req.method === "POST" && req.originalUrl === "/api/shops") {
        // Let them pass
      } else {
        return res.status(403).json({
          error: "No shop assigned. Please create a shop.",
          code: "NO_SHOP",
          needsShop: true,
        });
      }
    }

    // Attach user to request
    req.user = {
      id: dbUser.id,
      username: dbUser.username,
      full_name: dbUser.fullName,
      shop_id: dbUser.shopId,
      shop_name: dbUser.shopName,
      role: dbUser.role,
      email: dbUser.email,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(403).json({
      error: "Authentication failed.",
      code: "AUTH_FAILED",
    });
  }
}

/**
 * Middleware to require admin role
 * Must be used after authenticateToken
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required.",
      code: "NO_AUTH",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required.",
      code: "ADMIN_REQUIRED",
    });
  }

  next();
}

/**
 * Middleware to require specific role(s)
 * Must be used after authenticateToken
 * @param {string[]} roles - Array of allowed roles
 */
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
        code: "NO_AUTH",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}`,
        code: "INSUFFICIENT_ROLE",
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireRole,
};
