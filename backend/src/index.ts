import dns from "dns";
dns.setServers(['1.1.1.1', '8.8.8.8']);
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./lib/env.js";
import { authRoutes } from "./routes/auth.js";
import { transactionRoutes } from "./routes/transactions.js";

export const app = new Hono();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.route("/api/auth", authRoutes);
app.route("/api/transactions", transactionRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

if (env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`🚀 Vessify backend running at http://localhost:${info.port}`);
  });
}
