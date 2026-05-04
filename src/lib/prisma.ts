import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot reloads in development to
// avoid exhausting database connections. In production, a fresh instance is
// created per server process.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
