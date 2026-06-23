import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt } from "better-auth/plugins";
import { prisma } from "./prisma.js";
import { env } from "./env.js";

/**
 * Single Better Auth instance shared by the whole backend.
 *
 * - Email/password auth, hashing handled internally by Better Auth (scrypt).
 * - 7-day session expiry, matching the assignment spec.
 * - `jwt` plugin issues a signed JWT (exposed at /api/auth/token) so the
 *   frontend can attach a bearer token to API calls in addition to the
 *   cookie-based session — useful for the Loom demo / curl testing, and
 *   for any future non-browser client.
 * - No organization plugin: see prisma/schema.prisma header comment for
 *   why tenancy here is "organizationId = userId" rather than Better
 *   Auth's full multi-member org feature.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.FRONTEND_URL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days, per spec
    updateAge: 60 * 60 * 24, // refresh session if used within a day of expiry
  },
  plugins: [jwt()],
  advanced: {
    crossSubDomainCookies: { enabled: false },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
