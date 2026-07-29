import { Hono } from "hono";
import type { AppEnv } from "../auth.js";
import { requireAuth } from "../auth.js";
import { sql } from "../db.js";
import { ControlPlane, landaErrorToHttp } from "../control-plane.js";
import { createMemoryPlane } from "../plane.js";
import type { BackendName } from "../types.js";

/**
 * control plane HTTP — E2B-shaped surfaces, our seats
 * auth: Authorization: Bearer landa_…  or  X-Api-Key: landa_…
 *
 * Pass a ControlPlane so docker/memory registration is shared with CLI.
 */
export function createApp(plane: ControlPlane = createMemoryPlane()) {
  const app = new Hono<AppEnv>();

  // browser console — landa.tharavad.xyz + local vite
  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");
    const open = process.env.LANDA_CORS_ORIGIN === "*";
    const allowed =
      open ||
      !origin ||
      origin === "http://localhost:5173" ||
      origin === "http://127.0.0.1:5173" ||
      origin === "http://landa.tharavad.xyz" ||
      origin === "https://landa.tharavad.xyz" ||
      origin.endsWith(".tharavad.xyz");
    // reflect origin when allowed (required if browser sends credentials later)
    c.header("Access-Control-Allow-Origin", allowed ? (origin ?? "*") : "null");
    c.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Api-Key",
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

  app.get("/health", async (c) => {
    try {
      await sql()`SELECT 1`;
      return c.json({
        ok: true,
        service: "landa-api",
        db: true,
        backends: plane.backends(),
      });
    } catch (e) {
      return c.json(
        { ok: false, service: "landa-api", db: false, error: String(e) },
        503,
      );
    }
  });

  app.get("/v1/me", requireAuth, async (c) => {
    const auth = c.get("auth");
    return c.json({
      project: {
        id: auth.projectId,
        slug: auth.slug,
        maxConcurrent: auth.maxConcurrent,
        maxSessionSec: auth.maxSessionSec,
      },
      backends: plane.backends(),
    });
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

  app.get("/v1/sandboxes", requireAuth, async (c) => {
    const auth = c.get("auth");
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
    const body = (await c.req.json().catch(() => ({}))) as {
      template?: string;
      label?: string;
      /** optional TTL seconds (capped by project maxSessionSec) */
      ttlSec?: number;
    };
    const templateSlug = body.template ?? "landa-agent";
    const label = body.label ?? "";
    const db = sql();

    const countRows = await db<{ n: string }[]>`
      SELECT count(*)::text AS n FROM sandboxes
      WHERE project_id = ${auth.projectId}::uuid
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

    await db`
      INSERT INTO audit_events (project_id, sandbox_id, action, detail)
      VALUES (
        ${auth.projectId}::uuid,
        ${row.id as string}::uuid,
        'sandbox.create',
        ${db.json({ template: templateSlug, backend: tmpl.backend })}
      )
    `;

    return c.json({ sandbox: row }, 201);
  });

  app.get("/v1/sandboxes/:id", requireAuth, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id") as string;
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
    const rows = await db<{
      id: string;
      status: string;
      backend: string;
      metadata: { computerId?: string };
    }[]>`
      SELECT id, status, backend, metadata FROM sandboxes
      WHERE id = ${id}::uuid AND project_id = ${auth.projectId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return c.json({ error: "not found" }, 404);

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
      INSERT INTO audit_events (project_id, sandbox_id, action, detail)
      VALUES (
        ${auth.projectId}::uuid,
        ${id}::uuid,
        'sandbox.destroy',
        ${db.json({})}
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

    const rows = await db<{
      id: string;
      status: string;
      backend: string;
      metadata: { computerId?: string };
    }[]>`
      SELECT id, status, backend, metadata FROM sandboxes
      WHERE id = ${id}::uuid AND project_id = ${auth.projectId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
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
    const rows = await db<{
      status: string;
      metadata: { computerId?: string };
    }[]>`
      SELECT status, metadata FROM sandboxes
      WHERE id = ${id}::uuid AND project_id = ${auth.projectId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return c.json({ error: "not found" }, 404);
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
    const computerId = await liveComputerId(auth.projectId, id);
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
    const computerId = await liveComputerId(auth.projectId, id);
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
    projectId: string,
    sandboxId: string,
  ): Promise<
    | { ok: true; id: string }
    | { ok: false; status: number; body: Record<string, unknown> }
  > {
    const db = sql();
    const rows = await db<{
      status: string;
      metadata: { computerId?: string };
    }[]>`
      SELECT status, metadata FROM sandboxes
      WHERE id = ${sandboxId}::uuid AND project_id = ${projectId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, status: 404, body: { error: "not found" } };
    if (row.status !== "running" || !row.metadata?.computerId) {
      return { ok: false, status: 409, body: { error: "no live seat" } };
    }
    return { ok: true, id: row.metadata.computerId };
  }

  return app;
}
