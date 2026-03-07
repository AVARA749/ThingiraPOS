/**
 * Enhanced Dev Seed Script
 *
 * Creates initial shop, admin and staff users, suppliers, items, customers,
 * historical sales, and a past fuel shift with readings.
 *
 * Usage:
 *   npx prisma db seed
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const prisma = require("./client");

const SHOP_NAME = "Thingira Main Shop";

// 1. USERS
const USERS = [
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
    role: "staff",
  },
];

// 2. PUMPS & NOZZLES
const PUMPS = [
  {
    name: "Pump Island 1",
    pumpNumber: 1,
    nozzles: [
      { nozzleNumber: 1, fuelType: "petrol", unitPrice: 177.5 },
      { nozzleNumber: 2, fuelType: "diesel", unitPrice: 162.0 },
    ],
  },
  {
    name: "Pump Island 2",
    pumpNumber: 2,
    nozzles: [
      { nozzleNumber: 1, fuelType: "petrol", unitPrice: 177.5 },
      { nozzleNumber: 2, fuelType: "kerosene", unitPrice: 145.0 },
    ],
  },
];

// 3. SUPPLIERS
const SUPPLIERS = [
  {
    name: "Bidco Africa Ltd",
    address: "Industrial Area, Nairobi",
    phone: "0202055000",
    email: "sales@bidcoafrica.com",
  },
  {
    name: "Brookside Dairy",
    address: "Ruiru, Kenya",
    phone: "0711000000",
    email: "orders@brookside.co.ke",
  },
  {
    name: "East African Breweries",
    address: "Ruaraka, Nairobi",
    phone: "0202019200",
    email: "trade@eabl.com",
  },
  {
    name: "Kenblest Ltd",
    address: "Thika, Kenya",
    phone: "0672000000",
    email: "info@kenblest.com",
  },
  {
    name: "Multichoice Kenya",
    address: "Westlands, Nairobi",
    phone: "0711001111",
    email: "accounts@multichoice.co.ke",
  },
];

// 4. ITEMS
const ITEMS = [
  // Food Staples
  {
    name: "Jogoo Maize Flour 2kg",
    buyingPrice: 185,
    sellingPrice: 210,
    quantity: 50,
    minStockLevel: 10,
    category: "Food",
    barcode: "6191000000012",
  },
  {
    name: "Mumias Sugar 1kg",
    buyingPrice: 145,
    sellingPrice: 165,
    quantity: 80,
    minStockLevel: 15,
    category: "Food",
    barcode: "6191000000029",
  },
  {
    name: "Kapa Cooking Oil 1L",
    buyingPrice: 350,
    sellingPrice: 390,
    quantity: 40,
    minStockLevel: 10,
    category: "Food",
    barcode: "6191000000036",
  },
  // Dairy & Bread
  {
    name: "Brookside Milk 500ml",
    buyingPrice: 58,
    sellingPrice: 65,
    quantity: 60,
    minStockLevel: 20,
    category: "Dairy",
    barcode: "6191000000043",
  },
  {
    name: "Supaloaf Bread 400g",
    buyingPrice: 62,
    sellingPrice: 70,
    quantity: 30,
    minStockLevel: 10,
    category: "Bakery",
    barcode: "6191000000050",
  },
  // Beverages
  {
    name: "Coca Cola 500ml",
    buyingPrice: 45,
    sellingPrice: 60,
    quantity: 100,
    minStockLevel: 24,
    category: "Beverages",
    barcode: "6191000000067",
  },
  {
    name: "Quencher Water 1L",
    buyingPrice: 25,
    sellingPrice: 40,
    quantity: 150,
    minStockLevel: 50,
    category: "Beverages",
    barcode: "6191000000074",
  },
  {
    name: "Stoney Tangawizi 500ml",
    buyingPrice: 45,
    sellingPrice: 60,
    quantity: 80,
    minStockLevel: 20,
    category: "Beverages",
    barcode: "6191000000081",
  },
  // Household
  {
    name: "Dettol Antiseptic 500ml",
    buyingPrice: 340,
    sellingPrice: 450,
    quantity: 20,
    minStockLevel: 5,
    category: "Household",
    barcode: "6191000000098",
  },
  {
    name: "Geisha Petroleum Jelly 250ml",
    buyingPrice: 110,
    sellingPrice: 135,
    quantity: 40,
    minStockLevel: 10,
    category: "Toiletries",
    barcode: "6191000000105",
  },
  // Airtime / Services
  {
    name: "Safaricom Airtime Ksh 100",
    buyingPrice: 99,
    sellingPrice: 100,
    quantity: 9999,
    minStockLevel: 0,
    category: "Airtime",
    barcode: "0000000000100",
  },
  {
    name: "Gotv Subscription Monthly",
    buyingPrice: 950,
    sellingPrice: 1050,
    quantity: 9999,
    minStockLevel: 0,
    category: "Services",
    barcode: "0000000001050",
  },
];

// 5. CUSTOMERS
const CUSTOMERS = [
  {
    name: "Mary Wanjiku",
    phone: "0722111222",
    email: "mary.wanjiku@gmail.com",
    address: "Mweiga, Nyeri",
  },
  {
    name: "John Kamau",
    phone: "0733222333",
    email: "kamau.john@yahoo.com",
    address: "Karatina Town",
  },
  {
    name: "Amina Hassan",
    phone: "0744333444",
    email: null,
    address: "Nanyuki",
  },
  {
    name: "Omondi Ochieng",
    phone: "0755444555",
    email: "ochieng.odhiambo@hotmail.com",
    address: "Kisumu (Transit)",
  },
];

// 6. HISTORICAL SALES SCENARIOS
const HISTORICAL_SALES = [
  {
    receiptNumber: "RCP-001",
    customerName: "Mary Wanjiku",
    customerPhone: "0722111222",
    items: [
      { name: "Jogoo Maize Flour 2kg", quantity: 2, unitPrice: 210 },
      { name: "Brookside Milk 500ml", quantity: 1, unitPrice: 65 },
      { name: "Supaloaf Bread 400g", quantity: 1, unitPrice: 70 },
    ],
    paymentType: "cash",
    createdAt: new Date(Date.now() - 86400000 * 2),
  },
  {
    receiptNumber: "RCP-002",
    customerName: "Amina Hassan",
    customerPhone: "0744333444",
    items: [
      { name: "Kapa Cooking Oil 1L", quantity: 5, unitPrice: 390 },
      { name: "Mumias Sugar 1kg", quantity: 10, unitPrice: 165 },
    ],
    paymentType: "mpesa",
    createdAt: new Date(Date.now() - 86400000),
  },
];

async function seed() {
  console.log("🌱 Starting ThingiraPOS Seed (Kenyan Context)...\n");

  try {
    // 1. SETUP SHOP
    let shop = await prisma.shop.findFirst({
      where: { name: SHOP_NAME },
    });

    if (!shop) {
      console.log("🏪 Creating shop...");
      shop = await prisma.shop.create({
        data: {
          name: SHOP_NAME,
          address: "Muthua Road, Nyeri Town",
          phone: "0722000111",
        },
      });
      console.log(`   ${shop.name} (${shop.id})\n`);
    } else {
      console.log(`🏪 Using existing shop: ${shop.name} (${shop.id})\n`);
    }

    // 2. SYNC USERS
    console.log("👤 Syncing users...");
    for (const u of USERS) {
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
      console.log(`   ${u.role}: ${u.fullName} (${u.username})`);
    }
    console.log("");

    // 3. SYNC PUMPS & NOZZLES
    console.log("⛽ Syncing pumps & nozzles...");
    const createdNozzles = [];
    for (const p of PUMPS) {
      const existingPump = await prisma.pump.findFirst({
        where: { pumpNumber: p.pumpNumber, shopId: shop.id },
        include: { nozzles: true },
      });

      let pumpId;
      if (!existingPump) {
        const newPump = await prisma.pump.create({
          data: {
            name: p.name,
            pumpNumber: p.pumpNumber,
            shopId: shop.id,
            nozzles: {
              create: p.nozzles.map((n) => ({
                nozzleNumber: n.nozzleNumber,
                fuelType: n.fuelType,
                unitPrice: n.unitPrice,
                isActive: true,
              })),
            },
          },
          include: { nozzles: true },
        });
        pumpId = newPump.id;
        createdNozzles.push(...newPump.nozzles);
        console.log(`   Created Pump ${p.pumpNumber}: ${p.name}`);
      } else {
        pumpId = existingPump.id;
        createdNozzles.push(...existingPump.nozzles);
      }
    }
    console.log("");

    // 4. SYNC SUPPLIERS
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

    // 5. SYNC ITEMS
    console.log("📦 Syncing items...");
    const itemMap = {}; // Map name -> ID for sales creation
    for (const item of ITEMS) {
      const existing = await prisma.item.findFirst({
        where: { name: item.name, shopId: shop.id },
      });
      let dbItem;
      if (!existing) {
        dbItem = await prisma.item.create({
          data: { ...item, shopId: shop.id },
        });
      } else {
        dbItem = existing;
      }
      itemMap[dbItem.name] = dbItem;
    }
    console.log(`   Items synced\n`);

    // 6. SYNC CUSTOMERS
    console.log("👥 Syncing customers...");
    const customerMap = {}; // Map phone -> ID
    for (const c of CUSTOMERS) {
      const existing = await prisma.customer.findFirst({
        where: { phone: c.phone, shopId: shop.id },
      });
      let dbCustomer;
      if (!existing) {
        dbCustomer = await prisma.customer.create({
          data: { ...c, shopId: shop.id },
        });
      } else {
        dbCustomer = existing;
      }
      customerMap[dbCustomer.phone] = dbCustomer;
    }
    console.log(`   Customers synced\n`);

    // 7. CREATE HISTORICAL SALES
    console.log("💰 Creating historical sales...");
    for (const saleData of HISTORICAL_SALES) {
      const existing = await prisma.sale.findFirst({
        where: { receiptNumber: saleData.receiptNumber, shopId: shop.id },
      });

      if (!existing) {
        // Find customer
        const customer = customerMap[saleData.customerPhone];

        // Calculate Total
        let total = 0;
        const saleItemsPayload = saleData.items.map((i) => {
          const item = itemMap[i.name];
          const subtotal = Number(i.unitPrice) * i.quantity;
          total += subtotal;
          return {
            itemId: item.id,
            itemName: item.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            buyingPrice: item.buyingPrice,
            subtotal: subtotal,
          };
        });

        await prisma.sale.create({
          data: {
            receiptNumber: saleData.receiptNumber,
            customerId: customer?.id,
            customerName: saleData.customerName,
            customerPhone: saleData.customerPhone,
            totalAmount: total,
            paymentType: saleData.paymentType,
            status: "completed",
            shopId: shop.id,
            createdAt: saleData.createdAt,
            saleItems: { create: saleItemsPayload },
          },
        });
        console.log(`   Sale: ${saleData.receiptNumber} - KES ${total}`);
      }
    }
    console.log("");

    // 8. CREATE A PAST SHIFT (Fuel Station Demo)
    console.log("🕒 Creating a past shift for fuel station demo...");
    const staffUser = await prisma.user.findUnique({
      where: { username: "mercy" },
    });

    // Check if shift already exists (simple check based on time)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(8, 0, 0, 0); // Start at 8 AM

    const existingShift = await prisma.shiftRegister.findFirst({
      where: {
        userId: staffUser.id,
        createdAt: yesterday,
      },
    });

    if (!existingShift && createdNozzles.length > 0) {
      const shiftEndTime = new Date(yesterday);
      shiftEndTime.setHours(18, 0, 0, 0); // End at 6 PM

      const shift = await prisma.shiftRegister.create({
        data: {
          userId: staffUser.id,
          shopId: shop.id,
          startTime: yesterday,
          endTime: shiftEndTime,
          startCash: 15000.0,
          endCash: 48500.0, // Includes cash sales
          status: "closed",
          totalCashSales: 33500.0,
          totalMpesaSales: 12500.0,
          actualCash: 48500.0,
          expectedCash: 48500.0,
          variance: 0,
          notes: "Smooth shift, no pump alarms.",
        },
      });
      console.log(`   Shift created: ${shift.id}`);

      // Add Nozzle Readings for this shift
      console.log("   Adding nozzle readings...");
      for (const nozzle of createdNozzles) {
        // Simulate realistic reading: Opening 1000, Closing 1050 (Sold 50L)
        const openingReading = 1000.0;
        const volumeSold = 50.0;
        const closingReading = openingReading + volumeSold;
        const amountSold = volumeSold * Number(nozzle.unitPrice);

        await prisma.nozzleShiftReading.create({
          data: {
            shiftId: shift.id,
            nozzleId: nozzle.id,
            openingReading: openingReading,
            closingReading: closingReading,
            openingTime: shift.startTime,
            closingTime: shift.endTime,
            volumeSold: volumeSold,
            amountSold: amountSold,
          },
        });
      }
    } else {
      console.log("   Past shift already exists or no nozzles found.");
    }
    console.log("");

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Seed successful! Database is ready.");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
