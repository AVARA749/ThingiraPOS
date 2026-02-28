const bcrypt = require("bcryptjs");
const prisma = require("./prisma");

async function seed() {
  console.log("🧹 Cleaning ThingiraShop database...\n");

  try {
    // Clear all data in reverse order of dependencies
    await prisma.creditPayment.deleteMany();
    await prisma.creditLedger.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.purchase.deleteMany();
    await prisma.item.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.shiftRegister.deleteMany();
    await prisma.generalLedger.deleteMany();
    await prisma.user.deleteMany();
    await prisma.shop.deleteMany();

    // Create initial admin user (Note: This might need a Shop if we enforce it)
    const passwordHash = bcrypt.hashSync("thingira2024", 10);

    // We might need to create a shop first if foreign keys are strict
    const shop = await prisma.shop.create({
      data: {
        name: "Thingira Main Shop",
        address: "Nyeri, Kenya",
      },
    });

    await prisma.user.create({
      data: {
        username: "admin",
        passwordHash: passwordHash,
        fullName: "James Mwangi",
        role: "admin",
        phone: "0722000111",
        shopId: shop.id,
      },
    });

    console.log("👤 Admin user created (admin / thingira2024)");
    console.log(`🏪 Default shop created: ${shop.name}`);
    console.log("\n✅ Database cleaned! All tables are empty.");
    console.log("📌 Login: admin / thingira2024\n");
  } catch (err) {
    console.error("❌ Seeding error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
