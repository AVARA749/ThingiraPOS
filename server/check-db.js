const prisma = require("./db/prisma");

async function checkUsers() {
  try {
    const users = await prisma.user.findMany({
      select: { username: true, shopId: true },
    });
    console.log("Current users:", users);

    const shops = await prisma.shop.findMany({
      select: { id: true, name: true },
    });
    console.log("Current shops:", shops);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
