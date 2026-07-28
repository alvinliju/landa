import { Hono } from "hono";
import type { AppEnv } from "../auth.js";
import { requireAuth } from "../auth.js";
import { sql } from "../db.js";
import { ControlPlane } from "../control-plane.js";
import { MemoryBackend } from "../backends/memory.js";

/**
 * control plane HTTP — E2B-shaped surfaces, our seats
 * auth: Authorization: Bearer landa_…  or  X-Api-Key: landa_…
 */
export function createApp() {
  const app = new Hono<AppEnv>();
  const memory = new ControlPlane(new MemoryBackend());

  app.get("/health", async (c) => {
    try {
      await sql()`SELECT 1`;
      return c.json({ ok: true, service: "landa-api", db: true });
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
    });
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
    };
    const templateSlug = body.template ?? "memory-default";
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
      config: unknown;
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

    const expires = new Date(Date.now() + auth.maxSessionSec * 1000);

    let guestIp: string | null = null;
    let hostMeta: Record<string, unknown> = {};
    let status = "running";
    let err: string | null = null;

    if (tmpl.backend === "memory") {
      try {
        const info = await memory.create({
          name: label || templateSlug,
          template: templateSlug,
        });
        hostMeta = { computerId: info.id, endpoints: info.endpoints };
        status = "running";
      } catch (e) {
        status = "error";
        err = String(e);
      }
    } else {
      status = "creating";
      hostMeta = {
        note: "firecracker spawn not wired — seat row only",
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
        ${guestIp},
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

    if (row.backend === "memory" && row.metadata?.computerId) {
      await memory.destroy(row.metadata.computerId).catch(() => undefined);
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
    const body = (await c.req.json()) as { cmd?: string };
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
    if (row.backend !== "memory" || !row.metadata?.computerId) {
      return c.json(
        { error: "exec only on memory backend for now", backend: row.backend },
        501,
      );
    }

    const result = await memory.exec(row.metadata.computerId, {
      cmd: body.cmd,
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
  });

  return app;
}
