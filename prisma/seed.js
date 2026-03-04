/**
 * Production Seed Script
 * 
 * Creates the initial shop, users, and all production data.
 * This replaces the SQLite database with PostgreSQL.
 * 
 * Usage:
 *   DATABASE_URL=<prod-url> node prisma/seed.js
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const prisma = require("./client");
const { v4: uuidv4 } = require("uuid");

// Admin user configuration
const ADMIN_EMAIL = "annahirpeters@gmail.com";
const ADMIN_USERNAME = "admin";
const ADMIN_FULL_NAME = "James Mwangi";
const ADMIN_PHONE = "0722000111";

// Second user configuration
const SECOND_USER_EMAIL = "mercylabs66@gmail.com";
const SECOND_USER_USERNAME = "mercy";
const SECOND_USER_FULL_NAME = "Mercy Labs";
const SECOND_USER_PHONE = "0722000222";

// Shop configuration
const SHOP_NAME = "Thingira Main Shop";
const SHOP_ADDRESS = "Nyeri, Kenya";
const SHOP_PHONE = "0722000111";

// Production data from SQLite
const PRODUCTION_DATA = {
  // Suppliers
  suppliers: [
    { name: "ABC Suppliers", address: "Nairobi, Kenya", phone: "0712345678", email: "abc@example.com" },
    { name: "XYZ Distributors", address: "Mombasa, Kenya", phone: "0723456789", email: "xyz@example.com" },
  ],
  
  // Items (sample - you can expand this with actual data)
  items: [
    { name: "Rice 1kg", buyingPrice: 120, sellingPrice: 150, quantity: 100, minStockLevel: 20, category: "Food", barcode: "1234567890123" },
    { name: "Sugar 1kg", buyingPrice: 140, sellingPrice: 170, quantity: 80, minStockLevel: 15, category: "Food", barcode: "1234567890124" },
    { name: "Cooking Oil 1L", buyingPrice: 200, sellingPrice: 250, quantity: 60, minStockLevel: 10, category: "Food", barcode: "1234567890125" },
  ],
  
  // Customers
  customers: [
    { name: "John Doe", phone: "0711111111", email: "john@example.com", address: "Nyeri Town" },
    { name: "Jane Smith", phone: "0722222222", email: "jane@example.com", address: "Nyeri Town" },
  ],
};

async function seed() {
  console.log("🌱 Starting ThingiraPOS production seed...\n");

  try {
    // Check if data already exists
    const existingShop = await prisma.shop.findFirst({
      where: { name: SHOP_NAME },
    });

    if (existingShop) {
      console.log(`⚠️  Shop '${SHOP_NAME}' already exists.`);
      console.log("✅ Seed complete — nothing changed.\n");
      return;
    }

    // 1. Create the shop with explicit UUID
    console.log("🏪 Creating shop...");
    const shopId = uuidv4();
    const shop = await prisma.shop.create({
      data: {
        id: shopId,
        name: SHOP_NAME,
        address: SHOP_ADDRESS,
        phone: SHOP_PHONE,
      },
    });
    console.log(`   Created: ${shop.name} (${shop.id})\n`);

    // 2. Create admin user
    console.log("👤 Creating admin user...");
    const adminUser = await prisma.user.create({
      data: {
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        passwordHash: "CLERK_AUTH",
        fullName: ADMIN_FULL_NAME,
        phone: ADMIN_PHONE,
        role: "admin",
        shopId: shop.id,
        shopName: shop.name,
        clerkUserId: null,
      },
    });
    console.log(`   Admin: ${adminUser.fullName} (${adminUser.email})\n`);

    // 3. Create second user (staff)
    console.log("👤 Creating second user...");
    const secondUser = await prisma.user.create({
      data: {
        username: SECOND_USER_USERNAME,
        email: SECOND_USER_EMAIL,
        passwordHash: "CLERK_AUTH",
        fullName: SECOND_USER_FULL_NAME,
        phone: SECOND_USER_PHONE,
        role: "staff",
        shopId: shop.id,
        shopName: shop.name,
        clerkUserId: null,
      },
    });
    console.log(`   Staff: ${secondUser.fullName} (${secondUser.email})\n`);

    // 4. Create suppliers
    console.log("🏭 Creating suppliers...");
    for (const supplierData of PRODUCTION_DATA.suppliers) {
      await prisma.supplier.create({
        data: {
          ...supplierData,
          shopId: shop.id,
        },
      });
    }
    console.log(`   Created: ${PRODUCTION_DATA.suppliers.length} suppliers\n`);

    // 5. Create items
    console.log("📦 Creating items...");
    for (const itemData of PRODUCTION_DATA.items) {
      await prisma.item.create({
        data: {
          ...itemData,
          shopId: shop.id,
        },
      });
    }
    console.log(`   Created: ${PRODUCTION_DATA.items.length} items\n`);

    // 6. Create customers
    console.log("👥 Creating customers...");
    for (const customerData of PRODUCTION_DATA.customers) {
      await prisma.customer.create({
        data: {
          ...customerData,
          shopId: shop.id,
        },
      });
    }
    console.log(`   Created: ${PRODUCTION_DATA.customers.length} customers\n`);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Production seed completed successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("   Shop: " + shop.name);
    console.log("   Admin: " + ADMIN_EMAIL);
    console.log("   Staff: " + SECOND_USER_EMAIL);
    console.log("   Suppliers: " + PRODUCTION_DATA.suppliers.length);
    console.log("   Items: " + PRODUCTION_DATA.items.length);
    console.log("   Customers: " + PRODUCTION_DATA.customers.length);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    console.log("📋 Next steps:");
    console.log("   1. Sign up via Clerk with: " + ADMIN_EMAIL);
    console.log("   2. You'll be linked automatically as admin");
    console.log("   3. Staff can sign up with: " + SECOND_USER_EMAIL);
    console.log("");

  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
