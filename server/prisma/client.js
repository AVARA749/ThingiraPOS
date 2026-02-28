const { PrismaClient } = require("@prisma/client");

let prisma;

const clientOptions = {
  datasourceUrl: process.env.DATABASE_URL,
};

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient(clientOptions);
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient(clientOptions);
  }
  prisma = global.prisma;
}

module.exports = prisma;
