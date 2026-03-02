const supabase = require("../utils/supabase");
const prisma = require("../prisma/client");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    // Validate the token with Supabase — no JWT_SECRET needed
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    // Fetch local user profile for shop/role context
    const localUser = await prisma.user.findFirst({
      where: {
        username: { equals: user.user_metadata?.username, mode: "insensitive" },
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
      return res.status(401).json({ error: "User profile not found." });
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
