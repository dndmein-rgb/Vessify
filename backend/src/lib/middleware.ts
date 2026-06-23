import type { Context, Next } from "hono";
import { auth } from "./auth.js";

export type AuthedVariables = {
  userId: string;
  organizationId: string;
  userEmail: string;
};

/**
 * Validates the incoming request against Better Auth's session store and
 * attaches userId / organizationId to context. Every protected route reads
 * tenant scoping from here — never from a client-supplied field — so a
 * forged body or query param can never widen access to another tenant's
 * data.
 */
export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session || !session.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Simplified tenancy: organizationId is always derived from the
  // authenticated user's id, never from client input.
  c.set("userId", session.user.id);
  c.set("organizationId", session.user.id);
  c.set("userEmail", session.user.email);

  await next();
}
