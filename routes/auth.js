const express = require("express");
const prisma = require("../prisma/client");
const supabase = require("../utils/supabase");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.get("/test", (req, res) =>
  res.json({ message: "Auth routes are reachable" }),
);

// GET /api/auth/google - Initiate Google OAuth login
router.get("/google", async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.CLIENT_ORIGIN || "http://localhost:3000"}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      console.error("[Google OAuth] Error:", error.message);
      return res.status(400).json({ error: error.message });
    }

    // Return the OAuth URL for the client to redirect to
    res.json({ url: data.url });
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(500).json({ error: "Server error during Google OAuth initiation." });
  }
});

// POST /api/auth/google/callback - Handle Google OAuth callback
router.post("/google/callback", async (req, res) => {
  try {
    const { access_token, refresh_token, provider_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: "Access token is required." });
    }

    // Exchange the access token for a Supabase session
    const { data: userData, error: userError } = await supabase.auth.getUser(access_token);

    if (userError || !userData.user) {
      console.error("[Google Callback] Get user error:", userError?.message);
      return res.status(401).json({ error: "Invalid token." });
    }

    const supabaseUser = userData.user;
    const email = supabaseUser.email;
    const fullName = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || "";
    const avatarUrl = supabaseUser.user_metadata?.avatar_url || "";

    // Check if user exists locally
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { supabaseUserId: supabaseUser.id },
          { email: { equals: email, mode: "insensitive" } },
        ],
      },
    });

    // If user doesn't exist, create them
    if (!user) {
      const username = email.split("@")[0] + Math.floor(Math.random() * 1000);
      
      const { user: newUser } = await prisma.$transaction(async (tx) => {
        // Create shop
        const shop = await tx.shop.create({
          data: {
            name: `${fullName || username}'s Shop`,
            phone: "",
          },
        });

        // Create user
        const createdUser = await tx.user.create({
          data: {
            username,
            email,
            passwordHash: "GOOGLE_OAUTH",
            fullName: fullName || username,
            phone: "",
            shopName: shop.name,
            role: "admin",
            shopId: shop.id,
            supabaseUserId: supabaseUser.id,
          },
        });

        return { user: createdUser, shop };
      });

      user = newUser;
    } else {
      // Update Supabase user ID if not set
      if (!user.supabaseUserId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { supabaseUserId: supabaseUser.id },
        });
      }
    }

    res.json({
      token: access_token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.fullName,
        shop_name: user.shopName,
        shop_id: user.shopId,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Google callback error:", err);
    res.status(500).json({ error: "Server error during Google OAuth callback." });
  }
});

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
        emailRedirectTo: `${process.env.CLIENT_ORIGIN || "http://localhost:3000"}/auth/callback`,
      },
    });

    if (authError) {
      console.error("[Register] Supabase Auth error:", authError.message);
      return res.status(400).json({ error: authError.message });
    }

    // Check if user was created
    const supabaseUserId = authData.user?.id;

    // 2. Create local user and shop in a transaction
    const { user } = await prisma.$transaction(async (tx) => {
      // Create shop
      const shop = await tx.shop.create({
        data: {
          name: shopName || `${username}'s Shop`,
          phone: phone || "",
        },
      });

      // Create user with Supabase user ID linking
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
          supabaseUserId: supabaseUserId,
        },
      });

      return { user: newUser, shop };
    });

    // Users must confirm email before logging in
    res.status(201).json({
      message: "Registration successful. Please check your email to verify your account.",
      needsEmailConfirmation: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
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

    // 1. Find the user locally by username
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });

    if (!user) {
      console.warn(`[Login] User not found: ${username}`);
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // 2. Sign in with Supabase
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

    if (authError || !authData.session) {
      // Check if error is due to unconfirmed email
      if (authError?.message?.toLowerCase().includes("email not confirmed")) {
        return res.status(401).json({
          error: "Please verify your email address before logging in. Check your inbox for the confirmation link.",
          needsEmailConfirmation: true,
          email: user.email,
        });
      }
      console.warn(
        `[Login] Supabase Auth failed for ${username} (${user.email}):`,
        authError?.message
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

// POST /api/auth/resend-confirmation
router.post("/resend-confirmation", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      console.error("[Resend] Error:", error.message);
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: "Confirmation email resent. Please check your inbox." });
  } catch (err) {
    console.error("Resend confirmation error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
