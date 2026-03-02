const prisma = require("./prisma/client");

async function runMigration() {
  try {
    console.log("Checking database connection via Prisma...");
    await prisma.$connect();
    console.log("✅ Connection successful!");
  } catch (err) {
    console.error("❌ Connection failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
