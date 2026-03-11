/**
 * ThingiraPOS Final Enhanced Seed Script
 *
 * - Creates 2 Shops (Thingira Main & Station West).
 * - Seeds BOTH shops with their own scoped data.
 * - Links Items to Suppliers (National Oil, Bidco, EABL, etc.).
 * - Sets up Pumps for each shop with UNIQUE pump numbers.
 * - Generates Historical POS Sales for both shops.
 *
 * Usage: npx prisma db seed
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const prisma = require("./client");

// ================= CONFIGURATION =================

const SHOP_1_NAME = "Thingira Main Shop";
const SHOP_2_NAME = "Thingira Station West";

const USERS_SHOP_1 = [
  {
    username: "admin",
    email: "annahirpeters@gmail.com",
    fullName: "Peter Mwangi",
    phone: "0722000111",
    role: "admin",
  },
  {
    username: "mercy",
    email: "mercylabs66@gmail.com",
    fullName: "Mercy Wanjiku",
    phone: "0722000222",
    role: "cashier",
  },
];

const USERS_SHOP_2 = [
  {
    username: "admin2",
    email: "onemoreavara@gmail.com",
    fullName: "Ava Mwangi",
    phone: "0723000111",
    role: "admin",
  },
  {
    username: "faith",
    email: "faithwambui@gmail.com",
    fullName: "Faith Wambui",
    phone: "0723000222",
    role: "cashier",
  },
];

const CATEGORIES = [
  "Fuel",
  "Food",
  "Dairy",
  "Bakery",
  "Beverages",
  "Household",
  "Toiletries",
  "Electronics",
  "Airtime",
  "Services",
];

const SUPPLIERS = [
  {
    name: "National Oil",
    address: "Nairobi",
    phone: "0202000000",
    email: "tenders@nationaloil.co.ke",
  },
  {
    name: "Bidco Africa",
    address: "Industrial Area",
    phone: "0202055000",
    email: "sales@bidcoafrica.com",
  },
  {
    name: "Brookside Dairy",
    address: "Ruiru",
    phone: "0711000000",
    email: "orders@brookside.co.ke",
  },
  {
    name: "EABL",
    address: "Ruaraka",
    phone: "0202019200",
    email: "trade@eabl.com",
  },
  {
    name: "Kenblest Ltd",
    address: "Thika",
    phone: "0672000000",
    email: "info@kenblest.com",
  },
  {
    name: "Safaricom Ltd",
    address: "Westlands",
    phone: "0722000000",
    email: "trade@safaricom.co.ke",
  },
];

const ITEMS = [
  // Fuel
  {
    name: "Petrol",
    buyingPrice: 155.0,
    sellingPrice: 177.5,
    quantity: 50000,
    minStockLevel: 5000,
    category: "Fuel",
    barcode: "6191000001001",
    supplierName: "National Oil",
  },
  {
    name: "Diesel",
    buyingPrice: 145.0,
    sellingPrice: 162.0,
    quantity: 60000,
    minStockLevel: 5000,
    category: "Fuel",
    barcode: "6191000001002",
    supplierName: "National Oil",
  },
  // Food
  {
    name: "Jogoo Maize Flour 2kg",
    buyingPrice: 185,
    sellingPrice: 210,
    quantity: 500,
    minStockLevel: 100,
    category: "Food",
    barcode: "6191000000012",
    supplierName: "Kenblest Ltd",
  },
  {
    name: "Soko Maize Flour 2kg",
    buyingPrice: 175,
    sellingPrice: 195,
    quantity: 400,
    minStockLevel: 100,
    category: "Food",
    barcode: "6191000000013",
    supplierName: "Kenblest Ltd",
  },
  {
    name: "Mumias Sugar 1kg",
    buyingPrice: 145,
    sellingPrice: 165,
    quantity: 300,
    minStockLevel: 50,
    category: "Food",
    barcode: "6191000000014",
    supplierName: "Bidco Africa",
  },
  // Dairy
  {
    name: "Brookside Milk 500ml",
    buyingPrice: 50,
    sellingPrice: 65,
    quantity: 200,
    minStockLevel: 48,
    category: "Dairy",
    barcode: "6191000000021",
    supplierName: "Brookside Dairy",
  },
  // Beverages
  {
    name: "Coca Cola 500ml",
    buyingPrice: 45,
    sellingPrice: 60,
    quantity: 1000,
    minStockLevel: 240,
    category: "Beverages",
    barcode: "6191000000066",
    supplierName: "EABL",
  },
  {
    name: "Fanta Orange 500ml",
    buyingPrice: 45,
    sellingPrice: 60,
    quantity: 800,
    minStockLevel: 240,
    category: "Beverages",
    barcode: "6191000000067",
    supplierName: "EABL",
  },
  // Airtime
  {
    name: "Safaricom Airtime 100",
    buyingPrice: 99,
    sellingPrice: 100,
    quantity: 10000,
    minStockLevel: 0,
    category: "Airtime",
    barcode: "0000000000100",
    supplierName: "Safaricom Ltd",
  },
];

const CUSTOMERS = [
  { name: "Mary Wanjiku", phone: "0722111222", email: "mary.w@gmail.com" },
  { name: "John Kamau", phone: "0733222333", email: "kamau.j@yahoo.com" },
];

async function seed() {
  console.log("🌱 Starting Multi-Shop Seed...\n");

  try {
    // 1. Create Shops
    let shop1 = await prisma.shop.findFirst({ where: { name: SHOP_1_NAME } });
    if (!shop1) {
      shop1 = await prisma.shop.create({
        data: { name: SHOP_1_NAME, address: "Nyeri", phone: "0722000111" },
      });
    }

    let shop2 = await prisma.shop.findFirst({ where: { name: SHOP_2_NAME } });
    if (!shop2) {
      shop2 = await prisma.shop.create({
        data: { name: SHOP_2_NAME, address: "Athi River", phone: "0723000111" },
      });
    }

    // 2. Sync Users
    const syncUsers = async (users, shop) => {
      for (const u of users) {
        await prisma.user.upsert({
          where: { username: u.username },
          update: { ...u, shopId: shop.id, shopName: shop.name },
          create: { ...u, shopId: shop.id, shopName: shop.name },
        });
      }
    };
    await syncUsers(USERS_SHOP_1, shop1);
    await syncUsers(USERS_SHOP_2, shop2);

    // 3. Seed Each Shop with unique pump ranges
    await seedShopData(shop1, 0);
    await seedShopData(shop2, 10); // Offset to avoid PumpNumber global unique conflict

    console.log("\n✅ Seed Complete!");
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedShopData(shop, pumpOffset) {
  console.log(`\n📦 Seeding data for: ${shop.name}...`);

  // Create Categories (Defensive find-or-create)
  const categoryMap = {};
  for (const name of CATEGORIES) {
    let cat = await prisma.category.findFirst({
      where: { name, shopId: shop.id },
    });
    if (!cat) {
      cat = await prisma.category.create({
        data: { name, shopId: shop.id },
      });
    }
    categoryMap[name] = cat.id;
  }

  // Create Suppliers (Defensive find-or-create)
  const supplierMap = {};
  for (const s of SUPPLIERS) {
    let supplier = await prisma.supplier.findFirst({
      where: { name: s.name, shopId: shop.id },
    });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: { ...s, shopId: shop.id },
      });
    }
    supplierMap[s.name] = supplier.id;
  }

  // Create Items (Upsert logic via findFirst since no unique composite key)
  const itemMap = {};
  for (const item of ITEMS) {
    let dbItem = await prisma.item.findFirst({
      where: { name: item.name, shopId: shop.id },
    });

    const itemData = {
      name: item.name,
      buyingPrice: item.buyingPrice,
      sellingPrice: item.sellingPrice,
      quantity: item.quantity,
      minStockLevel: item.minStockLevel,
      barcode: item.barcode + (shop.name.includes("West") ? "-W" : ""),
      categoryId: categoryMap[item.category],
      supplierId: supplierMap[item.supplierName] || null,
      shopId: shop.id,
    };

    if (dbItem) {
      dbItem = await prisma.item.update({
        where: { id: dbItem.id },
        data: itemData,
      });
    } else {
      dbItem = await prisma.item.create({
        data: itemData,
      });
    }
    itemMap[item.name] = dbItem;
  }

  // Create Pumps (pumpNumber is GLOBAL unique)
  const pumps = [
    { number: pumpOffset + 1, fuel: "Petrol", price: 177.5 },
    { number: pumpOffset + 2, fuel: "Diesel", price: 162.0 },
  ];
  for (const p of pumps) {
    // Find by pump number globally first
    let dbPump = await prisma.pump.findUnique({
      where: { pumpNumber: p.number },
    });

    const pumpData = {
      name: `Pump ${p.number} (${p.fuel})`,
      pumpNumber: p.number,
      fuelType: p.fuel.toLowerCase(),
      unitPrice: p.price,
      itemId: itemMap[p.fuel].id,
      shopId: shop.id,
      lastReading: 0,
    };

    if (dbPump) {
      await prisma.pump.update({
        where: { id: dbPump.id },
        data: pumpData,
      });
    } else {
      await prisma.pump.create({
        data: pumpData,
      });
    }
  }

  // Create Customers
  for (const c of CUSTOMERS) {
    let dbCust = await prisma.customer.findFirst({
      where: { phone: c.phone, shopId: shop.id },
    });
    if (!dbCust) {
      await prisma.customer.create({
        data: { ...c, shopId: shop.id },
      });
    }
  }

  console.log(`   ✅ Finished seeding ${shop.name}`);
}

seed();
