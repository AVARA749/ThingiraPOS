const { getAuth, clerkClient } = require("@clerk/express");
const prisma = require("../prisma/client");

/**
 * Main authentication middleware
 * - Blocks login if no local user exists
 * - Links Clerk ID to staff account created by admin (if clerkUserId is null)
 * - Attaches user data to request
 */
async function authenticateToken(req, res, next) {
  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      return res.status(401).json({ 
        error: "Access denied. No token provided or token invalid.",
        code: "NO_AUTH_TOKEN"
      });
    }

    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    const fullName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
    const username = clerkUser.username || email?.split('@')[0];

    if (!email) {
      return res.status(400).json({
        error: "Email required. Please add an email to your account.",
        code: "NO_EMAIL"
      });
    }

    // Look for existing user by clerkUserId OR email
    let localUser = await prisma.user.findFirst({
      where: {
        OR: [
          { clerkUserId: auth.userId },
          { email: email }
        ]
      },
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

    if (!localUser) {
      // No local user found - they need to create a shop first (become admin)
      // or be invited by an admin (staff)
      return res.status(403).json({
        error: "Account not found. Please create a shop or contact your admin for access.",
        code: "USER_NOT_FOUND",
        needsShop: true,
      });
    }

    // If user exists but clerkUserId is null, link the accounts
    // This happens when admin creates staff, then staff logs in via Clerk
    if (!localUser.clerkUserId) {
      console.log(`🔗 Linking Clerk account to existing user: ${localUser.email}`);
      
      try {
        await prisma.user.update({
          where: { id: localUser.id },
          data: {
            clerkUserId: auth.userId,
            fullName: fullName || localUser.fullName,
            username: username || localUser.username,
          }
        });
        localUser.clerkUserId = auth.userId;
      } catch (linkError) {
        console.error("Failed to link Clerk account:", linkError);
        return res.status(500).json({
          error: "Failed to link account. Please contact support.",
          code: "LINK_FAILED"
        });
      }
    }

    // Check if user has a shop
    if (!localUser.shopId) {
      return res.status(403).json({
        error: "No shop assigned. Please create a shop or contact your admin.",
        code: "NO_SHOP",
        needsShop: true,
      });
    }

    // Attach user data to request
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
      code: "AUTH_FAILED"
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
      code: "NO_AUTH"
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required.",
      code: "ADMIN_REQUIRED"
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
        code: "NO_AUTH"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}`,
        code: "INSUFFICIENT_ROLE"
      });
    }

    next();
  };
}

module.exports = { 
  authenticateToken, 
  requireAdmin, 
  requireRole 
};
