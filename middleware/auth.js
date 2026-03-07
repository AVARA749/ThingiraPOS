const { getAuth, clerkClient } = require("@clerk/express");
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

    // Debug logging
    console.log("[Auth] Request path:", req.originalUrl);
    console.log(
      "[Auth] Authorization header:",
      req.headers.authorization ? "Present" : "Missing",
    );
    console.log("[Auth] getAuth result:", {
      userId: auth.userId,
      sessionId: auth.sessionId,
    });

    if (!auth.userId) {
      console.log("[Auth] No userId found - token invalid or missing");
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
      // Webhook fallback: try to fetch user from Clerk and create locally
      console.log(
        `[Auth] User ${auth.userId} not in DB, fetching from Clerk...`,
      );

      try {
        const clerkUser = await clerkClient.users.getUser(auth.userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress;

        if (email) {
          // Check for existing user by email
          const existing = await prisma.user.findFirst({
            where: { email },
            select: { id: true },
          });

          if (existing) {
            // Link existing user
            await prisma.user.update({
              where: { id: existing.id },
              data: { clerkUserId: auth.userId },
            });
            console.log(
              `[Auth] Linked user ${existing.id} to Clerk ${auth.userId}`,
            );
          } else {
            // Create new user
            const fullName =
              `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() ||
              email.split("@")[0];
            await prisma.user.create({
              data: {
                clerkUserId: auth.userId,
                email,
                fullName,
                username: email.split("@")[0],
                role: "staff",
              },
            });
            console.log(`[Auth] Created user from Clerk: ${email}`);
          }

          // Re-fetch the user we just created/linked
          const newDbUser = await prisma.user.findFirst({
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

          if (newDbUser) {
            // Attach and continue
            req.user = {
              id: newDbUser.id,
              username: newDbUser.username,
              full_name: newDbUser.fullName,
              shop_id: newDbUser.shopId,
              shop_name: newDbUser.shopName,
              role: newDbUser.role,
              email: newDbUser.email,
            };
            return next();
          }
        }
      } catch (err) {
        console.error("[Auth] Clerk fallback failed:", err.message);
      }

      return res.status(403).json({
        error: "Account not found. Please try signing in again.",
        code: "USER_NOT_FOUND",
        needsShop: false,
      });
    }

    // Check if user has a shop assigned
    if (!dbUser.shopId) {
      // Allow passing through to create a shop if they are calling POST /api/shops
      // We normalize the path to handle trailing slashes or sub-paths
      const normalizedPath = req.originalUrl.split("?")[0].replace(/\/$/, "");
      console.log(
        `[Auth] No shopId. Method: ${req.method}, Path: ${normalizedPath}`,
      );
      if (req.method === "POST" && normalizedPath === "/api/shops") {
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
