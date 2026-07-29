import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ControlPlane } from "./control-plane.js";
import { sql } from "./db.js";

/**
 * Destroy seats past expires_at (TTL). Safe to run often.
 * - Stops live ComputerBackend seats (memory / firecracker)
 * - Marks sandbox rows destroyed + audit event
 * - Best-effort orphan FC cleanup after API restart
 */
export async function reapExpiredSandboxes(
  plane: ControlPlane,
): Promise<{ reaped: number; errors: string[] }> {
  const db = sql();
  const errors: string[] = [];
  let reaped = 0;

  const rows = await db<{
    id: string;
    backend: string;
    metadata: { computerId?: string };
    expires_at: string;
  }[]>`
    SELECT id, backend, metadata, expires_at
    FROM sandboxes
    WHERE status IN ('creating', 'running', 'paused', 'error')
      AND expires_at IS NOT NULL
      AND expires_at < now()
    ORDER BY expires_at ASC
    LIMIT 100
  `;

  for (const row of rows) {
    try {
      const computerId = row.metadata?.computerId;
      if (computerId) {
        await plane.destroy(computerId).catch((e) => {
          console.warn(`[reaper] destroy seat ${computerId}: ${e}`);
          // after process restart plane has no seat — kill orphan FC files/procs
          if (computerId.startsWith("fc_")) {
            void cleanupOrphanFirecracker(computerId);
          }
        });
      }
      await db`
        UPDATE sandboxes
        SET status = 'destroyed', stopped_at = now(),
            error = COALESCE(NULLIF(error, ''), 'ttl expired')
        WHERE id = ${row.id}::uuid
          AND status != 'destroyed'
      `;
      await db`
        UPDATE vms
        SET status = 'destroyed', stopped_at = now(),
            error = COALESCE(NULLIF(error, ''), 'ttl expired')
        WHERE sandbox_id = ${row.id}::uuid
          AND status != 'destroyed'
      `;
      await db`
        INSERT INTO audit_events (project_id, sandbox_id, action, detail)
        SELECT project_id, id, 'sandbox.ttl_reap',
          ${db.json({ expires_at: row.expires_at, backend: row.backend })}
        FROM sandboxes WHERE id = ${row.id}::uuid
      `;
      reaped += 1;
      console.log(`[reaper] destroyed ${row.id} (expired ${row.expires_at})`);
    } catch (e) {
      errors.push(`${row.id}: ${e}`);
    }
  }

  return { reaped, errors };
}

async function cleanupOrphanFirecracker(computerId: string): Promise<void> {
  const assets =
    process.env.LANDA_FC_ASSETS ??
    join(process.env.LANDA_ROOT ?? process.cwd(), "firecracker/assets");
  const seatsDir = process.env.LANDA_FC_SEATS ?? join(assets, "seats");
  try {
    await rm(join(seatsDir, `${computerId}.ext4`), { force: true });
    await rm(join(seatsDir, `${computerId}.json`), { force: true });
  } catch {
    /* ignore */
  }
  // best-effort: kill firecracker holding that config
  await new Promise<void>((resolve) => {
    const p = spawn(
      "bash",
      [
        "-c",
        `pkill -f "firecracker.*${computerId}" 2>/dev/null || true`,
      ],
      { stdio: "ignore" },
    );
    p.on("close", () => resolve());
    p.on("error", () => resolve());
  });
  void readdir; // keep import used if tree-shaken oddly
}

/** Background interval (default 5 min). Returns stop(). */
export function startReaper(
  plane: ControlPlane,
  intervalMs = Number(process.env.LANDA_REAPER_INTERVAL_MS ?? 5 * 60 * 1000),
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await reapExpiredSandboxes(plane);
      if (r.reaped > 0 || r.errors.length > 0) {
        console.log(
          `[reaper] reaped=${r.reaped} errors=${r.errors.length}`,
        );
      }
    } catch (e) {
      console.error("[reaper] tick failed", e);
    }
  };
  void tick();
  const handle = setInterval(() => void tick(), intervalMs);
  if (typeof handle.unref === "function") handle.unref();
  console.log(
    `[reaper] every ${intervalMs}ms (expires_at / project max_session_sec)`,
  );
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
