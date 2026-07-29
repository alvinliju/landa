import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { AppEnv, AuthProject } from "../auth.js";
import { hashApiKey, requireAuth } from "../auth.js";
import { sql } from "../db.js";
import { ControlPlane, landaErrorToHttp } from "../control-plane.js";
import { createMemoryPlane } from "../plane.js";
import type { BackendName } from "../types.js";
import { auth } from "../better-auth.js";

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
    const body = (await c.req.json().catch(() => ({}))) as { label?: string };
    const label = (body.label ?? "agent").trim().slice(0, 64) || "agent";
    const raw = `landa_${randomBytes(24).toString("hex")}`;
    const prefix = raw.slice(0, 12);
    const keyHash = hashApiKey(raw);
    const db = sql();
    if (!a.userId) {
      return c.json(
        {
          error: "user identity required",
          hint: "sign in so API keys are owned by your account",
        },
        401,
      );
    }
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
  });

  /** Revoke (soft-delete) an API key. */
  app.delete("/v1/api-keys/:id", requireAuth, async (c) => {
    const a = c.get("auth");
    const id = c.req.param("id") as string;
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
    // product surface: only landa-agent for now
    const templateSlug = body.template ?? "landa-agent";
    if (templateSlug !== "landa-agent") {
      return c.json(
        {
          error: "template_unavailable",
          template: templateSlug,
          available: ["landa-agent"],
          hint: "Only landa-agent is live; more templates coming soon",
        },
        400,
      );
    }
    const label = body.label ?? "";
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
        { error: "concurrent limit", max: auth.maxConcurrent },
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
      return c.json({ error: "unknown template", template: templateSlug }, 400);
    }

    // TTL: request override or project max (default seed 8h)
    let ttlSec = auth.maxSessionSec;
    if (
      typeof body.ttlSec === "number" &&
      Number.isFinite(body.ttlSec) &&
      body.ttlSec > 0
    ) {
      ttlSec = Math.min(Math.floor(body.ttlSec), auth.maxSessionSec);
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
    const body = (await c.req.json()) as { cmd?: string; cwd?: string };
    if (!body.cmd) return c.json({ error: "cmd required" }, 400);
    const db = sql();

    const owned = await loadOwnedSandbox(db, auth, id);
    if (!owned.ok) return c.json(owned.body, owned.status as 400);
    const row = owned.row;
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.status !== "running") {
      return c.json({ error: "sandbox not running", status: row.status }, 409);
    }
    if (!row.metadata?.computerId) {
      return c.json(
        { error: "no live seat for sandbox", backend: row.backend },
        501,
      );
    }

    try {
      const result = await plane.exec(row.metadata.computerId, {
        cmd: body.cmd,
        cwd: body.cwd,
      });

      await db`
        INSERT INTO audit_events (project_id, sandbox_id, action, detail)
        VALUES (
          ${auth.projectId}::uuid,
          ${id}::uuid,
          'sandbox.exec',
          ${db.json({ cmd: body.cmd, exitCode: result.exitCode })}
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
    const db = sql();
    const owned = await loadOwnedSandbox(db, auth, id);
    if (!owned.ok) return c.json(owned.body, owned.status as 400);
    const row = owned.row;
    if (row.status !== "running" || !row.metadata?.computerId) {
      return c.json({ error: "no live seat" }, 409);
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
    const body = (await c.req.json()) as { path?: string; content?: string };
    if (!body.path || body.content === undefined) {
      return c.json({ error: "path and content required" }, 400);
    }
    const computerId = await liveComputerId(auth, id);
    if (!computerId.ok) return c.json(computerId.body, computerId.status as 400);
    try {
      await plane.writeFile(computerId.id, {
        path: body.path,
        content: body.content,
      });
      return c.json({ ok: true, path: body.path });
    } catch (e) {
      const { status, body: errBody } = landaErrorToHttp(e);
      return c.json(errBody, status as 400);
    }
  });

  app.get("/v1/sandboxes/:id/files", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
    const path = c.req.query("path") ?? ".";
    const mode = c.req.query("mode") ?? "list"; // list | read
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
    const owned = await loadOwnedSandbox(sql(), auth, sandboxId);
    if (!owned.ok) return owned;
    const row = owned.row;
    if (row.status !== "running" || !row.metadata?.computerId) {
      return { ok: false, status: 409, body: { error: "no live seat" } };
    }
    return { ok: true, id: row.metadata.computerId };
  }

  return app;
}
