import { z } from "zod";
import "dotenv/config"
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:8787"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  PORT: z
    .string()
    .default("8787")
    .transform((v) => parseInt(v, 10)),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // In test mode we allow a relaxed/mock env so Jest doesn't need a real DB.
  if (process.env.NODE_ENV === "test") {
    return {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "test-secret-key-please-change-1234567890",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
      FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
      PORT: 8787,
      NODE_ENV: "test",
    };
  }

  // Pre-populate defaults using RENDER_EXTERNAL_URL if available on Render
  const defaultUrl = process.env.RENDER_EXTERNAL_URL;
  if (defaultUrl) {
    if (!process.env.BETTER_AUTH_URL) {
      process.env.BETTER_AUTH_URL = defaultUrl;
    }
    if (!process.env.FRONTEND_URL) {
      process.env.FRONTEND_URL = defaultUrl;
    }
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables. Check .env against .env.example.");
  }
  return parsed.data;
}

export const env = loadEnv();
