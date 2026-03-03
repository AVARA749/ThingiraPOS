const { getAuth, clerkClient } = require("@clerk/express");
const prisma = require("../prisma/client");

async function authenticateToken(req, res, next) {
  try {
    const auth = getAuth(req);
    
    if (!auth.userId) {
      return res.status(401).json({ error: "Access denied. No token provided or token invalid." });
    }

    const clerkUser = await clerkClient.users.getUser(auth.userId);

    const email = clerkUser.emailAddresses[0]?.emailAddress;
    const fullName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
    const username = clerkUser.username || email.split('@')[0];

    // Fetch local user profile for shop/role context
    let localUser = await prisma.user.findFirst({
      where: {
        clerkUserId: auth.userId,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        shopId: true,
        shopName: true,
        role: true,
      },
    });

    if (!localUser) {
      // Auto-create user on first login
      const shop = await prisma.shop.create({
        data: {
          name: `${fullName || username}'s Shop`,
          phone: "",
        },
      });

      localUser = await prisma.user.create({
        data: {
          username: username,
          email: email,
          passwordHash: "CLERK_AUTH",
          fullName: fullName,
          shopName: shop.name,
          role: "admin",
          shopId: shop.id,
          clerkUserId: auth.userId,
        },
      });
    }

    req.user = {
      id: localUser.id,
      username: localUser.username,
      full_name: localUser.fullName,
      shop_id: localUser.shopId,
      shop_name: localUser.shopName,
      role: localUser.role,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(403).json({ error: "Authentication failed." });
  }
}

module.exports = { authenticateToken };
