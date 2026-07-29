import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { randomBytes, createHash } from "node:crypto";
import { sql } from "./db.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://landa:landa@127.0.0.1:5433/landa";

const secret =
  process.env.BETTER_AUTH_SECRET ??
  process.env.LANDA_AUTH_SECRET ??
  // dev fallback — set BETTER_AUTH_SECRET in production
  "landa-dev-auth-secret-change-me-in-prod-32b";

/** Public origin of the console (cookies / redirects). Prefer UI host so same-origin proxy works. */
export const publicOrigin =
  process.env.BETTER_AUTH_URL ??
  process.env.LANDA_PUBLIC_URL ??
  "http://landa.tharavad.xyz";

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

export const auth = betterAuth({
  database: pool,
  secret,
  baseURL: publicOrigin,
  basePath: "/api/auth",
  trustedOrigins: [
    publicOrigin,
    "http://landa.tharavad.xyz",
    "http://landa-back.tharavad.xyz",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(process.env.LANDA_TRUSTED_ORIGINS?.split(",").filter(Boolean) ?? []),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30d
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    // HTTP (no TLS yet): same-origin via UI proxy; cookies lax
    useSecureCookies: publicOrigin.startsWith("https"),
    defaultCookieAttributes: {
      sameSite: "lax",
      path: "/",
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await provisionUserProject(user.id, user.email, user.name);
          } catch (e) {
            console.error("[auth] provision project failed", e);
          }
        },
      },
    },
  },
});

function slugify(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const base = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "user";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Create free project + API key for a new user */
export async function provisionUserProject(
  userId: string,
  email: string,
  name: string,
): Promise<void> {
  const db = sql();
  const existing = await db<{ id: string }[]>`
    SELECT id FROM projects WHERE owner_user_id = ${userId} LIMIT 1
  `;
  if (existing[0]) return;

  const slug = slugify(email);
  const display = name?.trim() || email.split("@")[0] || "User";
  const rows = await db<{ id: string }[]>`
    INSERT INTO projects (slug, name, max_concurrent, max_session_sec, owner_user_id)
    VALUES (${slug}, ${display}, 10, 28800, ${userId})
    RETURNING id
  `;
  const projectId = rows[0]!.id;
  // optional dashboard key (hashed); browser uses session, not this key
  const raw = `landa_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const keyHash = createHash("sha256").update(raw).digest("hex");
  await db`
    INSERT INTO api_keys (project_id, label, key_prefix, key_hash)
    VALUES (${projectId}::uuid, 'dashboard', ${prefix}, ${keyHash})
  `;
  console.log(`[auth] provisioned project ${slug} for ${email}`);
}

export async function projectForUserId(
  userId: string,
): Promise<{
  projectId: string;
  slug: string;
  maxConcurrent: number;
  maxSessionSec: number;
} | null> {
  const db = sql();
  const rows = await db<{
    id: string;
    slug: string;
    max_concurrent: number;
    max_session_sec: number;
  }[]>`
    SELECT id, slug, max_concurrent, max_session_sec
    FROM projects
    WHERE owner_user_id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    // lazy provision if hook missed
    return null;
  }
  return {
    projectId: row.id,
    slug: row.slug,
    maxConcurrent: row.max_concurrent,
    maxSessionSec: row.max_session_sec,
  };
}

export type { Session } from "better-auth";
