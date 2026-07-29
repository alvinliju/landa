import { randomBytes, randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { AppEnv, AuthProject } from "../auth.js";
import { hashApiKey, requireAuth } from "../auth.js";
import { sql } from "../db.js";
import { ControlPlane, landaErrorToHttp } from "../control-plane.js";
import { createMemoryPlane } from "../plane.js";
import type { BackendName } from "../types.js";
import { auth } from "../better-auth.js";
import {
  isErr,
  okUuid,
  parseCmd,
  parseFileContent,
  parseFilePath,
  parseLabel,
  parseTemplate,
  parseTtlSec,
} from "../validate.js";
import {
  cloneRepo,
  ensureVolume,
  parseGuestIp,
  pushWorkspace,
  pullWorkspace,
  sessionVolumePath,
} from "../sessions.js";
import { rm } from "node:fs/promises";

type Sql = ReturnType<typeof sql>;

type OwnedSandboxRow = {
  id: string;
  status: string;
  backend: string;
  metadata: { computerId?: string };
};

/** Resolve sandbox only if the caller owns it (vms.user_id) or project when no user. */
async function loadOwnedSandbox(
  db: Sql,
  auth: AuthProject,
  sandboxId: string,
): Promise<
  | { ok: true; row: OwnedSandboxRow }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (auth.userId) {
    const rows = await db<OwnedSandboxRow[]>`
      SELECT s.id, s.status, s.backend, s.metadata
      FROM sandboxes s
      JOIN vms v ON v.sandbox_id = s.id
      WHERE s.id = ${sandboxId}::uuid
        AND v.user_id = ${auth.userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, status: 404, body: { error: "not found" } };
    return { ok: true, row };
  }
  const rows = await db<OwnedSandboxRow[]>`
    SELECT id, status, backend, metadata FROM sandboxes
    WHERE id = ${sandboxId}::uuid AND project_id = ${auth.projectId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { ok: false, status: 404, body: { error: "not found" } };
  return { ok: true, row };
}

/**
 * control plane HTTP — E2B-shaped surfaces, our seats
 * auth: Better Auth session cookie  OR  Bearer landa_… API key
 */
export function createApp(plane: ControlPlane = createMemoryPlane()) {
  const app = new Hono<AppEnv>();

  // browser console — landa.tharavad.xyz + local vite (credentials for session cookies)
  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");
    const allowed =
      !origin ||
      origin === "http://localhost:5173" ||
      origin === "http://127.0.0.1:5173" ||
      origin === "http://landa.tharavad.xyz" ||
      origin === "https://landa.tharavad.xyz" ||
      origin.endsWith(".tharavad.xyz") ||
      process.env.LANDA_CORS_ORIGIN === "*";
    if (allowed && origin) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
    } else if (allowed) {
      c.header("Access-Control-Allow-Origin", "*");
    }
    c.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Api-Key, Cookie",
    );
    c.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    c.header("Access-Control-Max-Age", "86400");
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });

  // Better Auth — sign-up / sign-in / session (proxied as same-origin from UI)
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/health", async (c) => {
    try {
      await sql()`SELECT 1`;
      return c.json({
        ok: true,
        service: "landa-api",
        db: true,
        backends: plane.backends(),
        auth: "better-auth",
      });
    } catch (e) {
      return c.json(
        { ok: false, service: "landa-api", db: false, error: String(e) },
        503,
      );
    }
  });

  app.get("/v1/me", requireAuth, async (c) => {
    const a = c.get("auth");
    let vmCount = 0;
    if (a.userId) {
      const rows = await sql()`
        SELECT count(*)::text AS n FROM vms
        WHERE user_id = ${a.userId}
          AND status IN ('creating', 'running', 'paused')
      `;
      vmCount = Number((rows[0] as { n: string } | undefined)?.n ?? 0);
    }
    return c.json({
      project: {
        id: a.projectId,
        slug: a.slug,
        maxConcurrent: a.maxConcurrent,
        maxSessionSec: a.maxSessionSec,
      },
      user: a.userId
        ? {
            id: a.userId,
            email: a.userEmail,
            name: a.userName,
          }
        : null,
      via: a.via,
      backends: plane.backends(),
      vms: { active: vmCount, maxConcurrent: a.maxConcurrent },
    });
  });

  /** List project API keys (prefix only — never return full secret). */
  app.get("/v1/api-keys", requireAuth, async (c) => {
    const a = c.get("auth");
    const rows = await sql()`
      SELECT id, user_id, label, key_prefix, last_used_at, created_at, revoked_at
      FROM api_keys
      WHERE project_id = ${a.projectId}::uuid
      ORDER BY created_at DESC
    `;
    return c.json({
      keys: rows.map((k) => ({
        id: k.id,
        userId: k.user_id,
        label: k.label,
        prefix: k.key_prefix,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at,
        revokedAt: k.revoked_at,
        active: k.revoked_at == null,
      })),
    });
  });

  /**
   * Create API key. Plaintext returned once in `key`.
   * Format: landa_<48 hex> — pass as Authorization: Bearer …
   */
  app.post("/v1/api-keys", requireAuth, async (c) => {
    const a = c.get("auth");
    if (!a.userId) {
      return c.json(
        {
          error: "user identity required",
          hint: "sign in so API keys are owned by your account",
        },
        401,
      );
    }
    const body = (await c.req.json().catch(() => ({}))) as { label?: string };
    const parsed = parseLabel(body.label, {
      field: "label",
      defaultValue: "agent",
      max: 64,
    });
    if (isErr(parsed)) return c.json(parsed, 400);
    const { label } = parsed;

    const db = sql();
    // unique among active keys on this project (case-insensitive)
    const dup = await db<{ id: string }[]>`
      SELECT id FROM api_keys
      WHERE project_id = ${a.projectId}::uuid
        AND revoked_at IS NULL
        AND lower(label) = lower(${label})
      LIMIT 1
    `;
    if (dup[0]) {
      return c.json(
        {
          error: "duplicate_label",
          message: `An active API key named "${label}" already exists. Choose a different label or revoke the old key.`,
          field: "label",
        },
        409,
      );
    }

    const raw = `landa_${randomBytes(24).toString("hex")}`;
    const prefix = raw.slice(0, 12);
    const keyHash = hashApiKey(raw);
    try {
      const rows = await db`
        INSERT INTO api_keys (project_id, user_id, label, key_prefix, key_hash)
        VALUES (
          ${a.projectId}::uuid,
          ${a.userId},
          ${label},
          ${prefix},
          ${keyHash}
        )
        RETURNING id, user_id, label, key_prefix, created_at
      `;
      const row = rows[0] as {
        id: string;
        user_id: string;
        label: string;
        key_prefix: string;
        created_at: string;
      };
      await db`
        INSERT INTO audit_events (project_id, action, detail)
        VALUES (
          ${a.projectId}::uuid,
          'api_key.create',
          ${db.json({
            key_id: row.id,
            user_id: a.userId,
            label,
            prefix,
          })}
        )
      `;
      return c.json(
        {
          key: raw,
          apiKey: {
            id: row.id,
            userId: row.user_id,
            label: row.label,
            prefix: row.key_prefix,
            createdAt: row.created_at,
          },
          hint: "Copy now — the full key is not shown again.",
        },
        201,
      );
    } catch (e) {
      // race: unique index api_keys_project_label_active_uidx
      const msg = String(e);
      if (msg.includes("api_keys_project_label_active_uidx") || msg.includes("unique")) {
        return c.json(
          {
            error: "duplicate_label",
            message: `An active API key named "${label}" already exists.`,
            field: "label",
          },
          409,
        );
      }
      throw e;
    }
  });

  /** Revoke (soft-delete) an API key. */
  app.delete("/v1/api-keys/:id", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id, "id");
    if (bad) return c.json(bad, 400);
    const db = sql();
    const updated = await db`
      UPDATE api_keys
      SET revoked_at = now()
      WHERE id = ${id}::uuid
        AND project_id = ${a.projectId}::uuid
        AND revoked_at IS NULL
      RETURNING id, revoked_at
    `;
    if (!updated[0]) {
      return c.json({ error: "not found or already revoked" }, 404);
    }
    await db`
      INSERT INTO audit_events (project_id, action, detail)
      VALUES (
        ${a.projectId}::uuid,
        'api_key.revoke',
        ${db.json({ key_id: id })}
      )
    `;
    return c.json({ ok: true, apiKey: updated[0] });
  });

  // ── landa-run v0: persistent sessions (host volume + optional live seat) ──

  app.get("/v1/sessions", requireAuth, async (c) => {
    const a = c.get("auth");
    if (!a.userId) {
      return c.json({ error: "user identity required", sessions: [] }, 401);
    }
    const rows = await sql()`
      SELECT id, name, status, repo_url, sandbox_id, computer_id, guest_ip,
             ssh_hint, error, created_at, updated_at, last_attach_at, volume_path
      FROM sessions
      WHERE user_id = ${a.userId} AND status != 'destroyed'
      ORDER BY updated_at DESC
    `;
    return c.json({
      sessions: rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        repoUrl: r.repo_url,
        computerId: r.computer_id,
        guestIp: r.guest_ip,
        sshHint: r.ssh_hint,
        error: r.error,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        lastAttachAt: r.last_attach_at,
        // volume_path is host-internal — hide full path from clients
        hasVolume: Boolean(r.volume_path),
      })),
    });
  });

  app.get("/v1/sessions/:id", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id);
    if (bad) return c.json(bad, 400);
    if (!a.userId) return c.json({ error: "user identity required" }, 401);
    const rows = await sql()`
      SELECT id, name, status, repo_url, computer_id, guest_ip, ssh_hint,
             error, created_at, updated_at, last_attach_at
      FROM sessions
      WHERE id = ${id}::uuid AND user_id = ${a.userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({
      session: {
        id: row.id,
        name: row.name,
        status: row.status,
        repoUrl: row.repo_url,
        computerId: row.computer_id,
        guestIp: row.guest_ip,
        sshHint: row.ssh_hint,
        error: row.error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAttachAt: row.last_attach_at,
      },
    });
  });

  /**
   * Create session: volume on host + optional git clone + boot seat + push /workspace.
   * Body: { name?, repo? }
   */
  app.post("/v1/sessions", requireAuth, async (c) => {
    const a = c.get("auth");
    if (!a.userId) {
      return c.json({ error: "user identity required" }, 401);
    }
    if (!plane.backends().includes("firecracker")) {
      return c.json(
        {
          error: "backend_unavailable",
          message: "landa-run needs firecracker on this host",
        },
        501,
      );
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      repo?: string;
      repoUrl?: string;
    };
    const nameP = parseLabel(body.name, {
      field: "name",
      defaultValue: `run-${Date.now().toString(36)}`,
      max: 48,
    });
    if (isErr(nameP)) return c.json(nameP, 400);
    const name = nameP.label.replace(/\s+/g, "-").toLowerCase();
    const repoUrl =
      typeof body.repo === "string"
        ? body.repo.trim()
        : typeof body.repoUrl === "string"
          ? body.repoUrl.trim()
          : "";

    const existing = await sql()`
      SELECT id FROM sessions
      WHERE user_id = ${a.userId} AND name = ${name} AND status != 'destroyed'
      LIMIT 1
    `;
    if (existing[0]) {
      return c.json(
        {
          error: "duplicate_name",
          message: `Session "${name}" already exists`,
          field: "name",
        },
        409,
      );
    }

    const sessionId = randomUUID();
    const volumePath = sessionVolumePath(a.userId, sessionId);

    if (repoUrl) {
      if (!/^https?:\/\//i.test(repoUrl) && !/^git@/i.test(repoUrl)) {
        return c.json(
          {
            error: "invalid_repo",
            message: "repo must be https:// or git@ URL",
            field: "repo",
          },
          400,
        );
      }
      const cl = await cloneRepo(volumePath, repoUrl);
      if (!cl.ok) {
        await ensureVolume(volumePath);
        // soft-fail: still create session with empty workspace
        console.warn("[sessions] clone failed:", cl.error);
      }
    } else {
      await ensureVolume(volumePath);
    }

    const db = sql();
    await db`
      INSERT INTO sessions (
        id, user_id, project_id, name, status, volume_path, repo_url
      )
      VALUES (
        ${sessionId}::uuid,
        ${a.userId},
        ${a.projectId}::uuid,
        ${name},
        'creating',
        ${volumePath},
        ${repoUrl || null}
      )
    `;

    try {
      const started = await bootSessionSeat(plane, volumePath, name);
      await db`
        UPDATE sessions SET
          status = 'running',
          computer_id = ${started.computerId},
          guest_ip = ${started.guestIp},
          ssh_hint = ${started.sshHint},
          error = null,
          updated_at = now(),
          last_attach_at = now()
        WHERE id = ${sessionId}::uuid
      `;
      return c.json(
        {
          session: {
            id: sessionId,
            name,
            status: "running",
            repoUrl: repoUrl || null,
            computerId: started.computerId,
            guestIp: started.guestIp,
            sshHint: started.sshHint,
            workspace: "/workspace",
          },
          hint: "Persistent volume on host. stop keeps files; start boots a new seat and restores /workspace.",
        },
        201,
      );
    } catch (e) {
      await db`
        UPDATE sessions SET
          status = 'error',
          error = ${String(e).slice(0, 500)},
          updated_at = now()
        WHERE id = ${sessionId}::uuid
      `;
      return c.json(
        {
          error: "session_boot_failed",
          message: String(e).slice(0, 500),
          sessionId,
        },
        500,
      );
    }
  });

  /** Stop: pull /workspace → host volume, destroy seat, keep volume. */
  app.post("/v1/sessions/:id/stop", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id);
    if (bad) return c.json(bad, 400);
    if (!a.userId) return c.json({ error: "user identity required" }, 401);
    const db = sql();
    const rows = await db<{
      id: string;
      status: string;
      volume_path: string;
      computer_id: string | null;
      guest_ip: string | null;
    }[]>`
      SELECT id, status, volume_path, computer_id, guest_ip
      FROM sessions
      WHERE id = ${id}::uuid AND user_id = ${a.userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.status === "destroyed") {
      return c.json({ error: "destroyed" }, 410);
    }

    if (row.computer_id && row.guest_ip) {
      await pullWorkspace(row.volume_path, row.guest_ip).catch(() => ({
        ok: false as const,
      }));
      await plane.destroy(row.computer_id).catch(() => undefined);
    }

    await db`
      UPDATE sessions SET
        status = 'stopped',
        computer_id = null,
        guest_ip = null,
        ssh_hint = null,
        error = null,
        updated_at = now()
      WHERE id = ${id}::uuid
    `;
    return c.json({ ok: true, status: "stopped" });
  });

  /** Start: boot seat, push host volume → /workspace. */
  app.post("/v1/sessions/:id/start", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id);
    if (bad) return c.json(bad, 400);
    if (!a.userId) return c.json({ error: "user identity required" }, 401);
    if (!plane.backends().includes("firecracker")) {
      return c.json({ error: "backend_unavailable" }, 501);
    }
    const db = sql();
    const rows = await db<{
      id: string;
      name: string;
      status: string;
      volume_path: string;
      computer_id: string | null;
    }[]>`
      SELECT id, name, status, volume_path, computer_id
      FROM sessions
      WHERE id = ${id}::uuid AND user_id = ${a.userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.status === "destroyed") {
      return c.json({ error: "destroyed" }, 410);
    }
    if (row.status === "running" && row.computer_id) {
      const live = await plane.get(row.computer_id);
      if (live?.status === "running") {
        return c.json({
          ok: true,
          status: "running",
          computerId: row.computer_id,
          hint: "already running",
        });
      }
    }

    try {
      const started = await bootSessionSeat(plane, row.volume_path, row.name);
      await db`
        UPDATE sessions SET
          status = 'running',
          computer_id = ${started.computerId},
          guest_ip = ${started.guestIp},
          ssh_hint = ${started.sshHint},
          error = null,
          updated_at = now(),
          last_attach_at = now()
        WHERE id = ${id}::uuid
      `;
      return c.json({
        ok: true,
        status: "running",
        computerId: started.computerId,
        guestIp: started.guestIp,
        sshHint: started.sshHint,
      });
    } catch (e) {
      await db`
        UPDATE sessions SET
          status = 'error',
          error = ${String(e).slice(0, 500)},
          updated_at = now()
        WHERE id = ${id}::uuid
      `;
      return c.json(
        { error: "session_start_failed", message: String(e).slice(0, 500) },
        500,
      );
    }
  });

  /** Exec inside a running session seat. */
  app.post("/v1/sessions/:id/exec", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id);
    if (bad) return c.json(bad, 400);
    if (!a.userId) return c.json({ error: "user identity required" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { cmd?: string };
    const cmdP = parseCmd(body.cmd);
    if (isErr(cmdP)) return c.json(cmdP, 400);

    const live = await liveSessionComputer(a.userId, id);
    if (!live.ok) return c.json(live.body, live.status as 400);
    try {
      const result = await plane.exec(live.computerId, {
        cmd: cmdP.cmd,
        timeoutMs: 120_000,
      });
      await sql()`
        UPDATE sessions SET last_attach_at = now(), updated_at = now()
        WHERE id = ${id}::uuid
      `;
      return c.json({ result });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  /**
   * Session files — same plane.writeFile/readFile as sandboxes, but paths
   * must live under /workspace (synced to host volume on stop).
   * Guest has no git; prefer POST create with repo= for clones.
   * Disk is small (~256MiB rootfs, ~160MiB free) — keep uploads lean.
   */
  app.post("/v1/sessions/:id/files", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id);
    if (bad) return c.json(bad, 400);
    if (!a.userId) return c.json({ error: "user identity required" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      path?: string;
      content?: string;
    };
    const pathP = parseFilePath(body.path, { roots: ["workspace"] });
    if (isErr(pathP)) return c.json(pathP, 400);
    const contentP = parseFileContent(body.content);
    if (isErr(contentP)) return c.json(contentP, 400);
    const live = await liveSessionComputer(a.userId, id);
    if (!live.ok) return c.json(live.body, live.status as 400);
    try {
      await plane.writeFile(live.computerId, {
        path: pathP.path,
        content: contentP.content,
      });
      await sql()`
        UPDATE sessions SET last_attach_at = now(), updated_at = now()
        WHERE id = ${id}::uuid
      `;
      return c.json({ ok: true, path: pathP.path });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  app.get("/v1/sessions/:id/files", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id);
    if (bad) return c.json(bad, 400);
    if (!a.userId) return c.json({ error: "user identity required" }, 401);
    const pathRaw = c.req.query("path") ?? "/workspace";
    const mode = c.req.query("mode") ?? "list"; // list | read
    if (mode !== "list" && mode !== "read") {
      return c.json(
        {
          error: "invalid_mode",
          message: "mode must be list or read",
          field: "mode",
        },
        400,
      );
    }
    let path = pathRaw;
    if (mode === "read" || pathRaw !== "/workspace") {
      const pathP = parseFilePath(
        pathRaw === "." ? "/workspace" : pathRaw,
        { roots: ["workspace"] },
      );
      if (isErr(pathP)) return c.json(pathP, 400);
      path = pathP.path;
    }
    const live = await liveSessionComputer(a.userId, id);
    if (!live.ok) return c.json(live.body, live.status as 400);
    try {
      if (mode === "read") {
        const file = await plane.readFile(live.computerId, path);
        return c.json({ file });
      }
      const entries = await plane.listFiles(live.computerId, path);
      return c.json({ entries });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  /** Destroy session: kill seat + delete host volume. */
  app.delete("/v1/sessions/:id", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
    const bad = okUuid(id);
    if (bad) return c.json(bad, 400);
    if (!a.userId) return c.json({ error: "user identity required" }, 401);
    const db = sql();
    const rows = await db<{
      volume_path: string;
      computer_id: string | null;
    }[]>`
      SELECT volume_path, computer_id FROM sessions
      WHERE id = ${id}::uuid AND user_id = ${a.userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.computer_id) {
      await plane.destroy(row.computer_id).catch(() => undefined);
    }
    await rm(row.volume_path, { recursive: true, force: true }).catch(
      () => undefined,
    );
    await db`
      UPDATE sessions SET
        status = 'destroyed',
        computer_id = null,
        guest_ip = null,
        ssh_hint = null,
        updated_at = now()
      WHERE id = ${id}::uuid
    `;
    return c.json({ ok: true, status: "destroyed" });
  });

  app.get("/v1/backends", requireAuth, async (c) => {
    return c.json({ backends: plane.backends() });
  });

  app.get("/v1/templates", requireAuth, async (c) => {
    const auth = c.get("auth");
    const rows = await sql()`
      SELECT id, slug, name, backend, config, created_at
      FROM templates
      WHERE project_id IS NULL OR project_id = ${auth.projectId}::uuid
      ORDER BY slug
    `;
    return c.json({ templates: rows });
  });

  /** User-owned VMs (identity table). Preferred list for the console. */
  app.get("/v1/vms", requireAuth, async (c) => {
    const auth = c.get("auth");
    if (!auth.userId) {
      return c.json({ error: "user identity required", vms: [] }, 400);
    }
    const rows = await sql()`
      SELECT
        v.id,
        v.sandbox_id,
        v.user_id,
        v.label,
        v.status,
        v.backend,
        v.template_slug,
        v.metadata,
        v.created_at,
        v.started_at,
        v.expires_at,
        v.error,
        s.guest_ip
      FROM vms v
      JOIN sandboxes s ON s.id = v.sandbox_id
      WHERE v.user_id = ${auth.userId}
        AND v.status != 'destroyed'
      ORDER BY v.created_at DESC
    `;
    return c.json({ vms: rows });
  });

  app.get("/v1/sandboxes", requireAuth, async (c) => {
    const auth = c.get("auth");
    // prefer identity-scoped VMs when we know the user
    if (auth.userId) {
      const rows = await sql()`
        SELECT
          s.id,
          s.label,
          s.status,
          s.backend,
          s.guest_ip,
          s.metadata,
          s.created_at,
          s.started_at,
          s.expires_at,
          s.error,
          v.id AS vm_id,
          v.user_id,
          v.template_slug
        FROM vms v
        JOIN sandboxes s ON s.id = v.sandbox_id
        WHERE v.user_id = ${auth.userId}
          AND s.status != 'destroyed'
        ORDER BY s.created_at DESC
      `;
      return c.json({ sandboxes: rows });
    }
    const rows = await sql()`
      SELECT id, label, status, backend, guest_ip, metadata, created_at, started_at, expires_at, error
      FROM sandboxes
      WHERE project_id = ${auth.projectId}::uuid
        AND status != 'destroyed'
      ORDER BY created_at DESC
    `;
    return c.json({ sandboxes: rows });
  });

  app.post("/v1/sandboxes", requireAuth, async (c) => {
    const auth = c.get("auth");
    if (!auth.userId) {
      return c.json(
        {
          error: "user identity required",
          hint: "sign in so VMs can be tied to your account",
        },
        401,
      );
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      template?: string;
      label?: string;
      /** optional TTL seconds (capped by project maxSessionSec) */
      ttlSec?: number;
    };

    const tpl = parseTemplate(body.template);
    if (isErr(tpl)) return c.json(tpl, 400);
    const templateSlug = tpl.template;
    // product surface: only landa-agent for now
    if (templateSlug !== "landa-agent") {
      return c.json(
        {
          error: "template_unavailable",
          message: "Only landa-agent is live; more templates coming soon",
          template: templateSlug,
          available: ["landa-agent"],
        },
        400,
      );
    }
    const lab = parseLabel(body.label, {
      field: "label",
      emptyOk: true,
      max: 64,
    });
    if (isErr(lab)) return c.json(lab, 400);
    const label = lab.label;

    const ttl = parseTtlSec(body.ttlSec, auth.maxSessionSec);
    if (isErr(ttl)) return c.json(ttl, 400);
    const ttlSec = ttl.ttlSec;

    const db = sql();

    // concurrent limit is per user (vms table)
    const countRows = await db<{ n: string }[]>`
      SELECT count(*)::text AS n FROM vms
      WHERE user_id = ${auth.userId}
        AND status IN ('creating', 'running', 'paused')
    `;
    const n = Number(countRows[0]?.n ?? 0);
    if (n >= auth.maxConcurrent) {
      return c.json(
        {
          error: "concurrent_limit",
          message: `At most ${auth.maxConcurrent} concurrent VMs`,
          max: auth.maxConcurrent,
        },
        429,
      );
    }

    const templates = await db<{
      id: string;
      backend: string;
      config: { image?: string; note?: string };
    }[]>`
      SELECT id, backend, config FROM templates
      WHERE slug = ${templateSlug}
        AND (project_id IS NULL OR project_id = ${auth.projectId}::uuid)
      LIMIT 1
    `;
    const tmpl = templates[0];
    if (!tmpl) {
      return c.json(
        {
          error: "unknown_template",
          message: `Unknown template ${templateSlug}`,
          template: templateSlug,
        },
        400,
      );
    }

    const expires = new Date(Date.now() + ttlSec * 1000);
    let hostMeta: Record<string, unknown> = {};
    let status = "running";
    let err: string | null = null;
    const backendName = tmpl.backend as BackendName;

    // seat backends we can actually spawn
    if (
      backendName === "memory" ||
      backendName === "firecracker" ||
      backendName === "docker"
    ) {
      if (!plane.backends().includes(backendName)) {
        return c.json(
          {
            error: "backend_unavailable",
            backend: backendName,
            available: plane.backends(),
            hint:
              backendName === "firecracker"
                ? "run landa-api as root on a KVM host with assets (scripts/fetch-landa-assets.sh)"
                : undefined,
          },
          501,
        );
      }
      try {
        const cfg = (
          tmpl.config && typeof tmpl.config === "object" ? tmpl.config : {}
        ) as {
          image?: string;
          rootfs?: string;
          kernel?: string;
          memMiB?: number;
          vcpu?: number;
        };
        const info = await plane.create({
          name: label || templateSlug,
          template: templateSlug,
          backend: backendName,
          image: typeof cfg.image === "string" ? cfg.image : undefined,
          rootfs: typeof cfg.rootfs === "string" ? cfg.rootfs : undefined,
          kernel: typeof cfg.kernel === "string" ? cfg.kernel : undefined,
          memoryMiB:
            typeof cfg.memMiB === "number" ? cfg.memMiB : undefined,
          vcpu: typeof cfg.vcpu === "number" ? cfg.vcpu : undefined,
        });
        status = info.status;
        err = info.error ?? null;
        // agent image bakes /work; ensure dirs on every running seat
        if (info.status === "running") {
          try {
            await plane.exec(info.id, {
              cmd: "mkdir -p /work/in /work/out && chmod 755 /work /work/in /work/out",
              timeoutMs: 10_000,
            });
          } catch {
            /* lite image still fine */
          }
        }
        hostMeta = {
          computerId: info.id,
          endpoints: info.endpoints,
          seatStatus: info.status,
          createMs: info.spec.labels?.createMs,
        };
      } catch (e) {
        status = "error";
        err = String(e);
        hostMeta = { error: String(e) };
      }
    } else {
      status = "creating";
      hostMeta = {
        note: `${backendName} spawn not wired — seat row only`,
        config: tmpl.config,
      };
    }

    const rows = await db`
      INSERT INTO sandboxes (
        project_id, template_id, label, status, backend,
        guest_ip, metadata, error, started_at, expires_at
      )
      VALUES (
        ${auth.projectId}::uuid,
        ${tmpl.id}::uuid,
        ${label},
        ${status},
        ${tmpl.backend},
        ${null},
        ${db.json(JSON.parse(JSON.stringify(hostMeta)))},
        ${err},
        ${status === "running" ? db`now()` : null},
        ${expires.toISOString()}
      )
      RETURNING id, label, status, backend, guest_ip, metadata, created_at, started_at, expires_at, error
    `;
    const row = rows[0]!;

    // identity ownership: user_id always; api_key_id when created via Bearer key
    const apiKeyId = auth.apiKeyId ?? null;
    const vmRows = await db`
      INSERT INTO vms (
        user_id, api_key_id, project_id, sandbox_id, label, status, backend,
        template_slug, metadata, error, started_at, expires_at
      )
      VALUES (
        ${auth.userId},
        ${apiKeyId},
        ${auth.projectId}::uuid,
        ${(row as { id: string }).id}::uuid,
        ${label},
        ${status},
        ${tmpl.backend},
        ${templateSlug},
        ${db.json(JSON.parse(JSON.stringify(hostMeta)))},
        ${err},
        ${status === "running" ? db`now()` : null},
        ${expires.toISOString()}
      )
      RETURNING id, user_id, api_key_id, sandbox_id
    `;
    const vm = vmRows[0] as {
      id: string;
      user_id: string;
      api_key_id: string | null;
      sandbox_id: string;
    };

    await db`
      INSERT INTO audit_events (project_id, sandbox_id, action, detail)
      VALUES (
        ${auth.projectId}::uuid,
        ${(row as { id: string }).id}::uuid,
        'sandbox.create',
        ${db.json({
          template: templateSlug,
          backend: tmpl.backend,
          user_id: auth.userId,
          api_key_id: apiKeyId,
          vm_id: vm.id,
          via: auth.via,
        })}
      )
    `;

    return c.json(
      {
        sandbox: {
          ...row,
          vm_id: vm.id,
          user_id: auth.userId,
          api_key_id: vm.api_key_id,
          template_slug: templateSlug,
        },
        vm: {
          id: vm.id,
          user_id: vm.user_id,
          api_key_id: vm.api_key_id,
          sandbox_id: vm.sandbox_id,
        },
      },
      201,
    );
  });

  app.get("/v1/sandboxes/:id", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
    const badId = okUuid(id);
    if (badId) return c.json(badId, 400);
    if (auth.userId) {
      const rows = await sql()`
        SELECT
          s.id, s.label, s.status, s.backend, s.guest_ip, s.metadata,
          s.created_at, s.started_at, s.expires_at, s.error,
          v.id AS vm_id, v.user_id, v.template_slug
        FROM sandboxes s
        JOIN vms v ON v.sandbox_id = s.id
        WHERE s.id = ${id}::uuid AND v.user_id = ${auth.userId}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json({ sandbox: row });
    }
    const rows = await sql()`
      SELECT id, label, status, backend, guest_ip, metadata, created_at, started_at, expires_at, error
      FROM sandboxes
      WHERE id = ${id}::uuid AND project_id = ${auth.projectId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ sandbox: row });
  });

  app.delete("/v1/sandboxes/:id", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
    const badId = okUuid(id);
    if (badId) return c.json(badId, 400);
    const db = sql();
    const owned = await loadOwnedSandbox(db, auth, id);
    if (!owned.ok) return c.json(owned.body, owned.status as 400);
    const row = owned.row;

    if (row.metadata?.computerId) {
      await plane.destroy(row.metadata.computerId).catch(() => undefined);
    }

    const updated = await db`
      UPDATE sandboxes
      SET status = 'destroyed', stopped_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, status, stopped_at
    `;
    await db`
      UPDATE vms
      SET status = 'destroyed', stopped_at = now()
      WHERE sandbox_id = ${id}::uuid
    `;

    await db`
      INSERT INTO audit_events (project_id, sandbox_id, action, detail)
      VALUES (
        ${auth.projectId}::uuid,
        ${id}::uuid,
        'sandbox.destroy',
        ${db.json({ user_id: auth.userId ?? null })}
      )
    `;

    return c.json({ sandbox: updated[0] });
  });

  app.post("/v1/sandboxes/:id/exec", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
    const badId = okUuid(id);
    if (badId) return c.json(badId, 400);
    const body = (await c.req.json().catch(() => ({}))) as {
      cmd?: string;
      cwd?: string;
    };
    const cmdP = parseCmd(body.cmd);
    if (isErr(cmdP)) return c.json(cmdP, 400);
    if (body.cwd !== undefined && typeof body.cwd !== "string") {
      return c.json(
        {
          error: "invalid_cwd",
          message: "cwd must be a string",
          field: "cwd",
        },
        400,
      );
    }
    const db = sql();

    const owned = await loadOwnedSandbox(db, auth, id);
    if (!owned.ok) return c.json(owned.body, owned.status as 400);
    const row = owned.row;
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.status !== "running") {
      return c.json(
        {
          error: "sandbox_not_running",
          message: "VM is not running",
          status: row.status,
        },
        409,
      );
    }
    if (!row.metadata?.computerId) {
      return c.json(
        {
          error: "no_live_seat",
          message: "No live seat for this VM",
          backend: row.backend,
        },
        501,
      );
    }

    try {
      const result = await plane.exec(row.metadata.computerId, {
        cmd: cmdP.cmd,
        cwd: body.cwd,
      });

      await db`
        INSERT INTO audit_events (project_id, sandbox_id, action, detail)
        VALUES (
          ${auth.projectId}::uuid,
          ${id}::uuid,
          'sandbox.exec',
          ${db.json({ cmd: cmdP.cmd, exitCode: result.exitCode })}
        )
      `;

      return c.json({ result });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  app.post("/v1/sandboxes/:id/snapshot", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
    const badId = okUuid(id);
    if (badId) return c.json(badId, 400);
    const db = sql();
    const owned = await loadOwnedSandbox(db, auth, id);
    if (!owned.ok) return c.json(owned.body, owned.status as 400);
    const row = owned.row;
    if (row.status !== "running" || !row.metadata?.computerId) {
      return c.json(
        {
          error: "no_live_seat",
          message: "No live seat for this VM",
        },
        409,
      );
    }
    try {
      const snapshot = await plane.worldSnapshot(row.metadata.computerId);
      return c.json({ snapshot });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  app.post("/v1/sandboxes/:id/files", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
    const badId = okUuid(id);
    if (badId) return c.json(badId, 400);
    const body = (await c.req.json().catch(() => ({}))) as {
      path?: string;
      content?: string;
    };
    const pathP = parseFilePath(body.path);
    if (isErr(pathP)) return c.json(pathP, 400);
    const contentP = parseFileContent(body.content);
    if (isErr(contentP)) return c.json(contentP, 400);
    const computerId = await liveComputerId(auth, id);
    if (!computerId.ok) return c.json(computerId.body, computerId.status as 400);
    try {
      await plane.writeFile(computerId.id, {
        path: pathP.path,
        content: contentP.content,
      });
      return c.json({ ok: true, path: pathP.path });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  app.get("/v1/sandboxes/:id/files", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
    const badId = okUuid(id);
    if (badId) return c.json(badId, 400);
    const pathRaw = c.req.query("path") ?? ".";
    // list mode allows "." relative; read should still validate
    const mode = c.req.query("mode") ?? "list"; // list | read
    if (mode !== "list" && mode !== "read") {
      return c.json(
        {
          error: "invalid_mode",
          message: "mode must be list or read",
          field: "mode",
        },
        400,
      );
    }
    let path = pathRaw;
    if (mode === "read" || pathRaw !== ".") {
      const pathP = parseFilePath(pathRaw === "." ? "/work" : pathRaw);
      if (isErr(pathP)) return c.json(pathP, 400);
      path = pathP.path;
    }
    const computerId = await liveComputerId(auth, id);
    if (!computerId.ok) return c.json(computerId.body, computerId.status as 400);
    try {
      if (mode === "read") {
        const file = await plane.readFile(computerId.id, path);
        return c.json({ file });
      }
      const entries = await plane.listFiles(computerId.id, path);
      return c.json({ entries });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  async function liveComputerId(
    auth: AuthProject,
    sandboxId: string,
  ): Promise<
    | { ok: true; id: string }
    | { ok: false; status: number; body: Record<string, unknown> }
  > {
    const bad = okUuid(sandboxId);
    if (bad) return { ok: false, status: 400, body: bad };
    const owned = await loadOwnedSandbox(sql(), auth, sandboxId);
    if (!owned.ok) return owned;
    const row = owned.row;
    if (row.status !== "running" || !row.metadata?.computerId) {
      return {
        ok: false,
        status: 409,
        body: { error: "no_live_seat", message: "No live seat for this VM" },
      };
    }
    return { ok: true, id: row.metadata.computerId };
  }

  async function liveSessionComputer(
    userId: string,
    sessionId: string,
  ): Promise<
    | { ok: true; computerId: string }
    | { ok: false; status: number; body: Record<string, unknown> }
  > {
    const rows = await sql()`
      SELECT computer_id, status FROM sessions
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}
      LIMIT 1
    `;
    const row = rows[0] as
      | { computer_id: string | null; status: string }
      | undefined;
    if (!row) {
      return { ok: false, status: 404, body: { error: "not found" } };
    }
    if (row.status !== "running" || !row.computer_id) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "session_not_running",
          message: "Start the session first",
          status: row.status,
        },
      };
    }
    return { ok: true, computerId: row.computer_id };
  }

  return app;
}

/** Boot landa-agent seat and push host volume → /workspace */
async function bootSessionSeat(
  plane: ControlPlane,
  volumePath: string,
  name: string,
): Promise<{ computerId: string; guestIp: string; sshHint: string }> {
  const info = await plane.create({
    name: `run-${name}`,
    template: "landa-agent",
    backend: "firecracker",
    memoryMiB: Number(process.env.LANDA_FC_MEM_MIB ?? 256),
    labels: { kind: "session", sessionName: name },
  });
  if (info.status !== "running") {
    await plane.destroy(info.id).catch(() => undefined);
    throw new Error(info.error || `seat status ${info.status}`);
  }
  const guestIp = parseGuestIp(info.endpoints, null);
  if (!guestIp) {
    await plane.destroy(info.id).catch(() => undefined);
    throw new Error("no guest IP from firecracker seat");
  }
  // ensure /workspace exists then push volume
  await plane.exec(info.id, {
    cmd: "mkdir -p /workspace && chmod 755 /workspace",
    timeoutMs: 15_000,
  });
  const push = await pushWorkspace(volumePath, guestIp);
  if (!push.ok) {
    // still return seat — empty workspace better than fail after boot
    console.warn("[sessions] push workspace:", push.error);
  }
  const sshHint =
    info.endpoints?.ssh ?? `ssh -i $LANDA_FC_SSH_KEY root@${guestIp}`;
  return { computerId: info.id, guestIp, sshHint };
}
