import { createHash } from "node:crypto";
import type { Context, Next } from "hono";
import { sql } from "./db.js";
import { auth, projectForUserId, provisionUserProject } from "./better-auth.js";

export type AuthProject = {
  projectId: string;
  slug: string;
  maxConcurrent: number;
  maxSessionSec: number;
  apiKeyId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  via: "api_key" | "session";
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
  if (!raw || raw.startsWith("landa_session")) return null;
  if (!raw.startsWith("landa_")) return null;
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
  // tie key traffic to project owner when present
  const owners = await db<{ owner_user_id: string | null; email: string | null; name: string | null }[]>`
    SELECT p.owner_user_id, u.email, u.name
    FROM projects p
    LEFT JOIN "user" u ON u.id = p.owner_user_id
    WHERE p.id = ${row.project_id}::uuid
    LIMIT 1
  `;
  const owner = owners[0];
  return {
    projectId: row.project_id,
    slug: row.slug,
    maxConcurrent: row.max_concurrent,
    maxSessionSec: row.max_session_sec,
    apiKeyId: row.api_key_id,
    userId: owner?.owner_user_id ?? undefined,
    userEmail: owner?.email ?? undefined,
    userName: owner?.name ?? undefined,
    via: "api_key",
  };
}

export async function resolveSession(
  headers: Headers,
): Promise<AuthProject | null> {
  try {
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return null;
    let project = await projectForUserId(session.user.id);
    if (!project) {
      await provisionUserProject(
        session.user.id,
        session.user.email,
        session.user.name,
      );
      project = await projectForUserId(session.user.id);
    }
    if (!project) return null;
    return {
      projectId: project.projectId,
      slug: project.slug,
      maxConcurrent: project.maxConcurrent,
      maxSessionSec: project.maxSessionSec,
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name,
      via: "session",
    };
  } catch {
    return null;
  }
}

export type AppEnv = {
  Variables: {
    auth: AuthProject;
  };
};

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const viaKey = await resolveApiKey(
    c.req.header("authorization") ?? c.req.header("x-api-key"),
  );
  if (viaKey) {
    c.set("auth", viaKey);
    await next();
    return;
  }
  const viaSession = await resolveSession(c.req.raw.headers);
  if (viaSession) {
    c.set("auth", viaSession);
    await next();
    return;
  }
  return c.json({ error: "unauthorized", hint: "sign in or pass API key" }, 401);
}
