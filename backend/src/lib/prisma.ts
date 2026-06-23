import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import dns from "dns";

// Neon hostnames sometimes fail to resolve through default DNS in local
// dev (seen in Docker/WSL). Force public resolvers there; leave production
// platform DNS untouched since it resolves Neon fine on its own, and this
// would otherwise affect every DNS lookup in the process, not just Postgres.
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  var __pool: Pool | undefined;
}

let pool = global.__pool;

if (!pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    min: 2,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    application_name: "vessify-backend",
  });
  
  if (process.env.NODE_ENV !== "production") {
    global.__pool = pool;
  }

  pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
  });
}

const adapter = new PrismaPg(pool);
const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export { prisma };