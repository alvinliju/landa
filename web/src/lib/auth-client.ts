import { createAuthClient } from "better-auth/react";

/** Same-origin in prod (UI proxies /api/auth). Vite proxies in dev. */
const baseURL =
  import.meta.env.VITE_LANDA_AUTH_URL?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

export const authClient = createAuthClient({
  baseURL,
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;
