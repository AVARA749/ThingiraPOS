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

    // Primary lookup: find by Clerk user ID (fast path after webhook sync)
    let localUser = await prisma.user.findFirst({
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

    // Email fallback: staff pre-registered by admin but hasn't signed in yet
    // (webhook won't have fired for them yet)
    if (!localUser) {
      // We need the email for the fallback — get it from Clerk session claims
      // Clerk embeds email in the token as a session claim if configured,
      // otherwise we rely on the webhook having already fired.
      // For robustness, we look at auth.sessionClaims for email.
      const email =
        auth.sessionClaims?.email ||
        (auth.sessionClaims?.primary_email_address_id ? undefined : undefined);

      if (email) {
        localUser = await prisma.user.findFirst({
          where: { email },
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
      }
    }

    if (!localUser) {
      return res.status(403).json({
        error:
          "Account not found. Please create a shop or contact your admin for access.",
        code: "USER_NOT_FOUND",
        needsShop: true,
      });
    }

    // Link Clerk ID if this is the staff member's first login
    if (!localUser.clerkUserId) {
      console.log(
        `🔗 Linking Clerk account to existing user: ${localUser.email}`,
      );
      try {
        await prisma.user.update({
          where: { id: localUser.id },
          data: { clerkUserId: auth.userId },
        });
        localUser.clerkUserId = auth.userId;
      } catch (linkError) {
        console.error("Failed to link Clerk account:", linkError);
        return res.status(500).json({
          error: "Failed to link account. Please contact support.",
          code: "LINK_FAILED",
        });
      }
    }

    if (!localUser.shopId) {
      return res.status(403).json({
        error: "No shop assigned. Please create a shop or contact your admin.",
        code: "NO_SHOP",
        needsShop: true,
      });
    }

    req.user = {
      id: localUser.id,
      username: localUser.username,
      full_name: localUser.fullName,
      shop_id: localUser.shopId,
      shop_name: localUser.shopName,
      role: localUser.role,
      email: localUser.email,
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
