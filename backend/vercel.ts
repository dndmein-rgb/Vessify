import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./src/lib/env.js";
import { authRoutes } from "./src/routes/auth.js";
import { transactionRoutes } from "./src/routes/transactions.js";

const app = new Hono();

// Only use logger in non-production
if (process.env.NODE_ENV !== "production") {
  app.use("*", logger());
}

app.use(
  "*",
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.route("/api/auth", authRoutes);
app.route("/api/transactions", transactionRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Vercel serverless function handler
export default app;
