/**
 * Production-safe seed script
 *
 * Creates the initial admin user via Clerk Auth + local Prisma profile.
 * Safe to re-run — skips if the admin already exists.
 *
 * Usage (point at production DB):
 *   DATABASE_URL=<prod-url> CLERK_SECRET_KEY=<key> node server/prisma/seed.js
 *
 * Or locally for dev:
 *   node server/db/seed.js
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const prisma = require("./client");
const { clerkClient } = require("@clerk/express");

const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "annahirpeters@gmail.com";
const ADMIN_PASSWORD = "thingira2024";
const ADMIN_FULL_NAME = "James Mwangi";
const ADMIN_PHONE = "0722000111";
const SHOP_NAME = "Thingira Main Shop";
const SHOP_ADDRESS = "Nyeri, Kenya";

async function seed() {
  console.log("🌱 Starting ThingiraPOS seed...\n");

  try {
    // 1. Check if admin already exists locally
    const existingUser = await prisma.user.findFirst({
      where: { username: { equals: ADMIN_USERNAME, mode: "insensitive" } },
    });

    if (existingUser) {
      console.log(
        `⚠️  Admin user '${ADMIN_USERNAME}' already exists. Skipping.`,
      );
      console.log("✅ Seed complete — nothing changed.\n");
      return;
    }

    // 2. Ensure shop exists
    let shop = await prisma.shop.findFirst({
      where: { name: { equals: SHOP_NAME, mode: "insensitive" } },
    });
    if (!shop) {
      shop = await prisma.shop.create({
        data: { name: SHOP_NAME, address: SHOP_ADDRESS },
      });
      console.log(`🏪 Shop created: ${shop.name}`);
    } else {
      console.log(`🏪 Shop already exists: ${shop.name}`);
    }

    // 3. Register admin in Clerk Auth
    let clerkUserId = null;
    const email = ADMIN_EMAIL;

    try {
      // First check if user exists in Clerk
      const userList = await clerkClient.users.getUserList({
        emailAddress: [email],
      });

      if (userList.data && userList.data.length > 0) {
        clerkUserId = userList.data[0].id;
        console.log(
          `⚠️  Clerk Auth user already exists: ${clerkUserId} — proceeding to create local profile.`,
        );
      } else {
        const authData = await clerkClient.users.createUser({
          emailAddress: [email],
          password: ADMIN_PASSWORD,
          firstName: ADMIN_FULL_NAME.split(" ")[0],
          lastName: ADMIN_FULL_NAME.split(" ").slice(1).join(" "),
          username: ADMIN_USERNAME,
        });
        clerkUserId = authData.id;
        console.log(`🔐 Clerk Auth user created: ${email} (${clerkUserId})`);
      }
    } catch (authError) {
      console.log(
        `⚠️  Clerk Auth Error: ${authError.errors?.[0]?.message || authError.message} — proceeding to create local profile.`,
      );
    }

    // 4. Create local user profile
    await prisma.user.create({
      data: {
        username: ADMIN_USERNAME,
        email: email,
        passwordHash: "CLERK_AUTH",
        fullName: ADMIN_FULL_NAME,
        phone: ADMIN_PHONE,
        role: "admin",
        shopId: shop.id,
        shopName: SHOP_NAME,
        clerkUserId: clerkUserId,
      },
    });

    console.log(`👤 Admin profile created: ${ADMIN_USERNAME}`);
    console.log("\n✅ Seed complete!");
    console.log(`📌 Login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}\n`);
  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
