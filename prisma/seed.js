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
    let shop = await prisma.shop.findFirst({
      where: { name: SHOP_NAME },
    });

    if (!shop) {
      console.log("🏪 Creating shop...");
      shop = await prisma.shop.create({
        data: {
          name: SHOP_NAME,
          address: "Nyeri, Kenya",
          phone: "0722000111",
        },
      });
      console.log(`   ${shop.name} (${shop.id})\n`);
    } else {
      console.log(`🏪 Using existing shop: ${shop.name} (${shop.id})\n`);
    }

    // 2. Sync users
    console.log("👤 Syncing users...");
    for (const u of USERS) {
      // Using upsert on username which is @unique
      await prisma.user.upsert({
        where: { username: u.username },
        update: {
          email: u.email,
          fullName: u.fullName,
          phone: u.phone,
          role: u.role,
          shopId: shop.id,
          shopName: shop.name,
        },
        create: {
          ...u,
          shopId: shop.id,
          shopName: shop.name,
          clerkUserId: null,
        },
      });
      console.log(`   ${u.role}: ${u.email}`);
    }
    console.log("");

    // 3. Sync suppliers
    console.log("🏭 Syncing suppliers...");
    for (const s of SUPPLIERS) {
      const existing = await prisma.supplier.findFirst({
        where: { name: s.name, shopId: shop.id },
      });
      if (!existing) {
        await prisma.supplier.create({ data: { ...s, shopId: shop.id } });
      }
    }
    console.log(`   Suppliers synced\n`);

    // 4. Sync items
    console.log("📦 Syncing items...");
    for (const item of ITEMS) {
      const existing = await prisma.item.findFirst({
        where: { name: item.name, shopId: shop.id },
      });
      if (!existing) {
        await prisma.item.create({ data: { ...item, shopId: shop.id } });
      }
    }
    console.log(`   Items synced\n`);

    // 5. Sync customers
    console.log("👥 Syncing customers...");
    for (const c of CUSTOMERS) {
      const existing = await prisma.customer.findFirst({
        where: { name: c.name, shopId: shop.id },
      });
      if (!existing) {
        await prisma.customer.create({ data: { ...c, shopId: shop.id } });
      }
    }
    console.log(`   Customers synced\n`);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Seed successful!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
