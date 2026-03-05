const express = require("express");
const { Webhook } = require("svix");
const prisma = require("../prisma/client");

const router = express.Router();

/**
 * GET /api/webhooks/health
 * Health check endpoint to verify webhook configuration
 */
router.get("/health", async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  const databaseUrl = process.env.DATABASE_URL ? "configured" : "missing";
  
  // Test database connection
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    dbStatus = "error: " + err.message;
  }
  
  res.json({
    status: "ok",
    webhookSecret: secret ? "configured" : "missing",
    databaseUrl,
    dbStatus,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/webhooks/test
 * Test endpoint to simulate a webhook event (for testing only)
 * Requires admin authorization
 */
router.post("/test", express.json(), async (req, res) => {
  // Only allow in development or with a test key
  const testKey = req.headers["x-test-key"];
  if (process.env.NODE_ENV === "production" && testKey !== process.env.WEBHOOK_TEST_KEY) {
    return res.status(403).json({ error: "Not authorized" });
  }
  
  const { email, clerkUserId, firstName, lastName } = req.body;
  
  if (!email || !clerkUserId) {
    return res.status(400).json({ error: "email and clerkUserId required" });
  }
  
  try {
    const fullName = `${firstName || ""} ${lastName || ""}`.trim() || email.split("@")[0];
    const username = email.split("@")[0];
    
    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ clerkUserId }, { email }],
      },
    });
    
    if (existingUser) {
      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: { clerkUserId, fullName },
      });
      return res.json({ message: "User updated", user: updated });
    }
    
    // Create new user
    const newUser = await prisma.user.create({
      data: {
        clerkUserId,
        email,
        fullName,
        username,
        role: "staff",
      },
    });
    
    res.json({ message: "User created", user: newUser });
  } catch (err) {
    console.error("[Webhook Test] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/webhooks/clerk
 * Receives Clerk webhook events and syncs user data to the local database.
 * This route must receive the RAW body (not parsed JSON) for signature verification.
 * It must NOT be protected by clerkMiddleware / authenticateToken.
 *
 * Events handled:
 *   - user.created  → create a local User record for brand-new signups; link to pre-registered staff by email
 *   - user.updated  → keep profile details in sync
 *   - user.deleted  → unlink Clerk ID (preserves business data)
 */
router.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!secret) {
      console.error("CLERK_WEBHOOK_SECRET is not set");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    // Verify the webhook signature using svix
    const wh = new Webhook(secret);
    let event;

    try {
      event = wh.verify(req.body, {
        "svix-id": req.headers["svix-id"],
        "svix-timestamp": req.headers["svix-timestamp"],
        "svix-signature": req.headers["svix-signature"],
      });
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const { type: eventType, data } = event;
    console.log(`[Webhook] Received: ${eventType} for user ${data.id}`);

    try {
      if (eventType === "user.created" || eventType === "user.updated") {
        const clerkUserId = data.id;
        const email = data.email_addresses?.[0]?.email_address;
        const firstName = data.first_name || "";
        const lastName = data.last_name || "";
        const fullName = `${firstName} ${lastName}`.trim() || null;
        const username = data.username || null;

        if (!email) {
          console.warn(`[Webhook] No email for user ${clerkUserId} — skipping`);
          return res.json({ received: true, skipped: "no_email" });
        }

        // Find existing user by clerkUserId OR email (pre-registered staff)
        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [{ clerkUserId }, { email }],
          },
          select: { id: true, clerkUserId: true },
        });

        if (existingUser) {
          // Existing record (pre-registered staff or returning user): link + sync
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              clerkUserId,
              ...(fullName && { fullName }),
              ...(username && { username }),
            },
          });
          console.log(
            `[Webhook] Linked/updated user ${existingUser.id} \u2192 Clerk ${clerkUserId}`,
          );
        } else if (eventType === "user.created") {
          // Brand-new admin signing up for the first time.
          // Create a local record so auth middleware can resolve them immediately
          // without waiting for the shop-creation step.
          const derivedUsername = username || email.split("@")[0];
          await prisma.user.create({
            data: {
              clerkUserId,
              email,
              fullName: fullName || derivedUsername,
              username: derivedUsername,
              role: "staff", // POST /api/shops will promote them to admin
            },
          });
          console.log(`[Webhook] Created local user for new signup: ${email}`);
        } else {
          // user.updated for an email we don't have yet — out-of-sequence, ignore
          console.log(
            `[Webhook] user.updated for unknown email ${email} \u2014 skipping`,
          );
        }
      } else if (eventType === "user.deleted") {
        const clerkUserId = data.id;
        // Unlink Clerk ID so the user can't authenticate anymore,
        // but preserve business data (sales, purchases, etc.)
        await prisma.user.updateMany({
          where: { clerkUserId },
          data: { clerkUserId: null },
        });
        console.log(`[Webhook] Unlinked deleted Clerk user ${clerkUserId}`);
      }
    } catch (err) {
      console.error(`[Webhook] DB error processing ${eventType}:`, err);
      // Return 500 so Clerk/Svix will retry the webhook
      return res.status(500).json({ error: "Failed to process webhook event" });
    }

    // Always return 2xx so Svix marks delivery as successful
    return res.json({ received: true });
  },
);

module.exports = router;
