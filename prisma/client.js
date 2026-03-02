const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = createClient();
} else {
  if (!global.prisma) global.prisma = createClient();
  prisma = global.prisma;
}

module.exports = prisma;
