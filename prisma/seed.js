/**
 * Dev Seed Script
 *
 * Creates initial shop, admin and staff users, suppliers, items, and customers.
 * Clerk owns authentication — no passwords stored.
 *
 * Usage:
 *   npx prisma db seed
 *   DATABASE_URL=<url> npx prisma db seed
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const prisma = require("./client");

const SHOP_NAME = "Thingira Main Shop";

// Pre-registered users (linked to Clerk on first sign-in via webhook)
const USERS = [
  {
    username: "admin",
    email: "annahirpeters@gmail.com",
    fullName: "James Mwangi",
    phone: "0722000111",
    role: "admin",
  },
  {
    username: "mercy",
    email: "mercylabs66@gmail.com",
    fullName: "Mercy Labs",
    phone: "0722000222",
    role: "staff",
  },
];

const SUPPLIERS = [
  {
    name: "ABC Suppliers",
    address: "Nairobi, Kenya",
    phone: "0712345678",
    email: "abc@example.com",
  },
  {
    name: "XYZ Distributors",
    address: "Mombasa, Kenya",
    phone: "0723456789",
    email: "xyz@example.com",
  },
];

const ITEMS = [
  {
    name: "Rice 1kg",
    buyingPrice: 120,
    sellingPrice: 150,
    quantity: 100,
    minStockLevel: 20,
    category: "Food",
    barcode: "1234567890123",
  },
  {
    name: "Sugar 1kg",
    buyingPrice: 140,
    sellingPrice: 170,
    quantity: 80,
    minStockLevel: 15,
    category: "Food",
    barcode: "1234567890124",
  },
  {
    name: "Cooking Oil 1L",
    buyingPrice: 200,
    sellingPrice: 250,
    quantity: 60,
    minStockLevel: 10,
    category: "Food",
    barcode: "1234567890125",
  },
];

const CUSTOMERS = [
  {
    name: "John Doe",
    phone: "0711111111",
    email: "john@example.com",
    address: "Nyeri Town",
  },
  {
    name: "Jane Smith",
    phone: "0722222222",
    email: "jane@example.com",
    address: "Nyeri Town",
  },
];

async function seed() {
  console.log("🌱 Starting ThingiraPOS seed...\n");

  try {
    const existingShop = await prisma.shop.findFirst({
      where: { name: SHOP_NAME },
    });
    if (existingShop) {
      console.log(`⚠️  Shop '${SHOP_NAME}' already exists — skipping.\n`);
      return;
    }

    // 1. Create shop
    console.log("🏪 Creating shop...");
    const shop = await prisma.shop.create({
      data: {
        name: SHOP_NAME,
        address: "Nyeri, Kenya",
        phone: "0722000111",
      },
    });
    console.log(`   ${shop.name} (${shop.id})\n`);

    // 2. Create users (no password — Clerk owns auth, webhook links clerkUserId on first sign-in)
    console.log("👤 Creating users...");
    for (const u of USERS) {
      await prisma.user.create({
        data: {
          ...u,
          shopId: shop.id,
          shopName: shop.name,
          clerkUserId: null,
        },
      });
      console.log(`   ${u.role}: ${u.email}`);
    }
    console.log("");

    // 3. Create suppliers
    console.log("🏭 Creating suppliers...");
    for (const s of SUPPLIERS) {
      await prisma.supplier.create({ data: { ...s, shopId: shop.id } });
    }
    console.log(`   ${SUPPLIERS.length} suppliers\n`);

    // 4. Create items
    console.log("📦 Creating items...");
    for (const item of ITEMS) {
      await prisma.item.create({ data: { ...item, shopId: shop.id } });
    }
    console.log(`   ${ITEMS.length} items\n`);

    // 5. Create customers
    console.log("👥 Creating customers...");
    for (const c of CUSTOMERS) {
      await prisma.customer.create({ data: { ...c, shopId: shop.id } });
    }
    console.log(`   ${CUSTOMERS.length} customers\n`);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Seed complete!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Next: sign up via Clerk with one of the seeded emails");
    console.log("   The webhook will link your Clerk account automatically.\n");
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
