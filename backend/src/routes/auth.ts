import { Hono } from "hono";
import { auth } from "../lib/auth.js";

export const authRoutes = new Hono();

/**
 * Better Auth ships a complete handler for all its endpoints
 * (/sign-up/email, /sign-in/email, /sign-out, /session, /token, etc).
 * We mount it under /api/auth/* and let it handle everything, rather than
 * hand-rolling register/login routes that would just re-implement what
 * Better Auth already does (correctly) internally — hashing, session
 * creation, cookie setting.
 */
authRoutes.on(["GET", "POST"], "/*", (c) => auth.handler(c.req.raw));
