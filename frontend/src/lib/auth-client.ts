import { createAuthClient } from "better-auth/react";

/**
 * Better Auth's own React client. This is the entire "auth on the
 * frontend" layer — it talks directly to the backend's /api/auth/*
 * routes, manages the session cookie, and exposes typed hooks
 * (useSession) plus signIn/signUp/signOut methods.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "",
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, signIn, signUp, signOut } = authClient;
