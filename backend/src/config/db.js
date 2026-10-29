const { PrismaClient } = require("@prisma/client");
const env = require("./env");

// Single shared Prisma client for the whole process (recommended by Prisma docs:
// one instance per app, not one per request, to avoid exhausting MySQL connections).
const prisma = new PrismaClient({
  log: env.isProd ? ["error", "warn"] : ["error", "warn"]
});

async function disconnectDb() {
  await prisma.$disconnect();
}

// Graceful shutdown is wired once, in server.js, to avoid double-handling
// SIGINT/SIGTERM from two places.
module.exports = { prisma, disconnectDb };
