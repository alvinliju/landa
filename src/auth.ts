import { createHash } from "node:crypto";
import type { Context, Next } from "hono";
import { sql } from "./db.js";

export type AuthProject = {
  projectId: string;
  slug: string;
  maxConcurrent: number;
  maxSessionSec: number;
  apiKeyId: string;
};

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export async function resolveApiKey(
  header: string | undefined,
): Promise<AuthProject | null> {
  if (!header) return null;
  const raw = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : header.trim();
  if (!raw) return null;
  const keyHash = hashApiKey(raw);
  const db = sql();
  const rows = await db<
    {
      project_id: string;
      slug: string;
      max_concurrent: number;
      max_session_sec: number;
      api_key_id: string;
    }[]
  >`
    SELECT
      p.id AS project_id,
      p.slug,
      p.max_concurrent,
      p.max_session_sec,
      k.id AS api_key_id
    FROM api_keys k
    JOIN projects p ON p.id = k.project_id
    WHERE k.key_hash = ${keyHash}
      AND k.revoked_at IS NULL
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  await db`
    UPDATE api_keys SET last_used_at = now() WHERE id = ${row.api_key_id}::uuid
  `;
  return {
    projectId: row.project_id,
    slug: row.slug,
    maxConcurrent: row.max_concurrent,
    maxSessionSec: row.max_session_sec,
    apiKeyId: row.api_key_id,
  };
}

export type AppEnv = {
  Variables: {
    auth: AuthProject;
  };
};

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const auth = await resolveApiKey(
    c.req.header("authorization") ?? c.req.header("x-api-key"),
  );
  if (!auth) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("auth", auth);
  await next();
}
