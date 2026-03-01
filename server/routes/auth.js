const express = require("express");
const prisma = require("../prisma/client");
const supabase = require("../utils/supabase");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.get("/test", (req, res) =>
  res.json({ message: "Auth routes are reachable" }),
);

router.post("/register", async (req, res) => {
  try {
    const { username, email, password, fullName, shopName, phone } = req.body;

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        error: "Username, email, password, and full name are required.",
      });
    }

    // 0. Check if user already exists locally
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: "insensitive" } },
          { email: { equals: email, mode: "insensitive" } },
        ],
      },
    });

    if (existingUser) {
      const field =
        existingUser.username.toLowerCase() === username.toLowerCase() ?
          "Username"
        : "Email";
      return res.status(400).json({ error: `${field} is already taken.` });
    }

    // 1. Register in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, full_name: fullName },
      },
    });

    if (authError) {
      console.error("[Register] Supabase Auth error:", authError.message);
      return res.status(400).json({ error: authError.message });
    }

    // 2. Create local user and shop in a transaction
    const { user } = await prisma.$transaction(async (tx) => {
      // Create shop
      const shop = await tx.shop.create({
        data: {
          name: shopName || `${username}'s Shop`,
          phone: phone || "",
        },
      });

      // Create user
      const newUser = await tx.user.create({
        data: {
          username,
          email,
          passwordHash: "SUPABASE_AUTH",
          fullName,
          phone: phone || "",
          shopName: shop.name,
          role: "admin",
          shopId: shop.id,
        },
      });

      return { user: newUser, shop };
    });

    res.status(201).json({
      token: authData.session?.access_token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.fullName,
        shop_name: user.shopName,
        shop_id: user.shopId,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Username or email is already in use." });
    }
    res.status(500).json({ error: "Server error during registration." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required." });
    }

    // 1. Find the user locally to get their email
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });

    if (!user) {
      console.warn(`[Login] User not found: ${username}`);
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // 2. Sign in with Supabase using the stored email
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

    if (authError || !authData.session) {
      console.warn(
        `[Login] Supabase Auth failed for ${username} (${user.email}):`,
        authError?.message,
      );
      return res.status(401).json({ error: "Invalid username or password." });
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
