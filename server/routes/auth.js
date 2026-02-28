const express = require("express");
const prisma = require("../db/prisma");
const supabase = require("../utils/supabase");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.get("/test", (req, res) =>
  res.json({ message: "Auth routes are reachable" }),
);

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password, full_name, shop_name, phone } = req.body;

    if (!username || !password || !full_name) {
      return res
        .status(400)
        .json({ error: "Username, password, and full name are required." });
    }

    // 1. Register in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: `${username}@thingira.local`,
      password,
      options: {
        data: { full_name, username },
      },
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // 2. Handle Shop logic
    let finalShopName = shop_name || "ThingiraShop";
    let shop = await prisma.shop.findFirst({
      where: { name: { equals: finalShopName, mode: "insensitive" } },
    });
    if (!shop) {
      shop = await prisma.shop.create({ data: { name: finalShopName } });
    }

    // 3. Create local user profile
    const shopUserCount = await prisma.user.count({ where: { shopId: shop.id } });
    const role = shopUserCount === 0 ? "admin" : "staff";

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: "SUPABASE_AUTH",
        fullName: full_name,
        shopId: shop.id,
        shopName: finalShopName,
        phone: phone || "",
        role,
      },
    });

    // Return Supabase session token directly — no custom JWT needed
    res.status(201).json({
      token: authData.session?.access_token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        shop_name: user.shopName,
        shop_id: user.shopId,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Server error during registration." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    // 1. Sign in with Supabase — returns session with access_token
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: `${username}@thingira.local`,
        password,
      });

    if (authError || !authData.session) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // 2. Get local user profile for shop/role context
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });

    if (!user) {
      return res.status(401).json({ error: "User profile not found." });
    }

    res.json({
      token: authData.session.access_token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        shop_name: user.shopName,
        shop_id: user.shopId,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login." });
  }
});

// GET /api/auth/me
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        shopName: true,
        shopId: true,
        phone: true,
        role: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
