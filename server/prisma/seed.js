/**
 * Production-safe seed script
 *
 * Creates the initial admin user via Supabase Auth + local Prisma profile.
 * Safe to re-run — skips if the admin already exists.
 *
 * Usage (point at production DB):
 *   DATABASE_URL=<prod-url> SUPABASE_URL=<url> SUPABASE_ANON_KEY=<key> node server/db/seed.js
 *
 * Or locally for dev:
 *   node server/db/seed.js
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const prisma = require("./client");
const supabase = require("../utils/supabase");

const ADMIN_USERNAME = "admin";
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

    // 3. Register admin in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: `${ADMIN_USERNAME}@thingira.local`,
      password: ADMIN_PASSWORD,
      options: {
        data: { full_name: ADMIN_FULL_NAME, username: ADMIN_USERNAME },
      },
    });

    if (authError) {
      // If already registered in Supabase, continue to create local profile
      console.log(
        `⚠️  Supabase Auth: ${authError.message} — proceeding to create local profile.`,
      );
    } else {
      console.log(
        `🔐 Supabase Auth user created: ${ADMIN_USERNAME}@thingira.local`,
      );
    }

    // 4. Create local user profile
    await prisma.user.create({
      data: {
        username: ADMIN_USERNAME,
        passwordHash: "SUPABASE_AUTH",
        fullName: ADMIN_FULL_NAME,
        phone: ADMIN_PHONE,
        role: "admin",
        shopId: shop.id,
        shopName: SHOP_NAME,
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
