/**
 * Cloud sync: landa session volume is the workspace home.
 * Local mirror under ~/.cache/landa/workspaces/<sessionId>/ for T3/agents on laptop.
 * Auto-watch keeps mirror ↔ volume aligned while T3 runs.
 */
import { watch, type FSWatcher } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { LandaClient } from "./api.js";
import type { LandaConfig } from "./config.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".data",
  ".turbo",
  ".next",
  "t3",
  ".pnpm-store",
  ".landa", // avoid thrashing marker files (we still push marker explicitly)
]);

export function isCloudSyncOn(
  cfg: LandaConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const e = env.LANDA_CLOUD_SYNC?.trim().toLowerCase();
  if (e === "1" || e === "true" || e === "on" || e === "yes") return true;
  if (e === "0" || e === "false" || e === "off" || e === "no") return false;
  // default ON — cloud is the product default
  if (cfg.cloudSync === false) return false;
  return true;
}

export function parseCloudSyncFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (["1", "true", "on", "yes", "enable", "enabled"].includes(v)) return true;
  if (["0", "false", "off", "no", "disable", "disabled"].includes(v))
    return false;
  throw new Error(`cloud-sync: use on|off (got "${raw}")`);
}

export function mirrorRoot(sessionId: string): string {
  return (
    process.env.LANDA_MIRROR_ROOT?.trim() ||
    join(homedir(), ".cache", "landa", "workspaces", sessionId)
  );
}

export type CloudMeta = {
  cloudSync: true;
  sessionId: string;
  name: string;
  apiBase: string;
  updatedAt: string;
};

/** Write marker on cloud volume (host-first files API). */
export async function writeCloudMarker(
  client: LandaClient,
  session: { id: string; name: string },
  apiBase: string,
): Promise<void> {
  const meta: CloudMeta = {
    cloudSync: true,
    sessionId: session.id,
    name: session.name,
    apiBase,
    updatedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(meta, null, 2) + "\n";
  await client.writeFile(session.id, "/workspace/.landa/cloud.json", body);
  await client.writeFile(
    session.id,
    "/workspace/.landa/README.md",
    [
      "# landa cloud workspace",
      "",
      "This directory is a **landa session volume** (host-first truth).",
      "",
      `- session: \`${session.name}\` (\`${session.id}\`)`,
      `- api: \`${apiBase}\``,
      "",
      "Edit via landa CLI / T3 cloud mode. Seat start only for offline exec.",
      "",
    ].join("\n"),
  );
}

/** Ensure local mirror dir + link file for T3 cwd. */
export async function ensureLocalMirror(
  session: { id: string; name: string },
  apiBase: string,
): Promise<string> {
  const root = mirrorRoot(session.id);
  await mkdir(join(root, ".landa"), { recursive: true });
  const meta: CloudMeta = {
    cloudSync: true,
    sessionId: session.id,
    name: session.name,
    apiBase,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(
    join(root, ".landa", "session.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    join(root, "README.md"),
    [
      `# ${session.name} (landa cloud mirror)`,
      "",
      "Local mirror of a landa session. Source of truth is the **cloud volume**.",
      "",
      "```bash",
      `landa sync pull -r ${session.id}`,
      `landa sync push -r ${session.id}`,
      "```",
      "",
    ].join("\n"),
    "utf8",
  );
  return root;
}

type RemoteEntry = { path: string; kind?: string; size?: number };

async function listRemote(
  client: LandaClient,
  sessionId: string,
  workspacePath: string,
): Promise<RemoteEntry[]> {
  const r = await client.listFiles(sessionId, workspacePath);
  return r.entries ?? [];
}

/** Pull remote /workspace into local mirror (best-effort, skips big/binary). */
export async function pullToMirror(
  client: LandaClient,
  sessionId: string,
  localRoot: string,
  remotePath = "/workspace",
): Promise<{ files: number; skipped: number }> {
  await mkdir(localRoot, { recursive: true });
  let files = 0;
  let skipped = 0;

  async function walk(remote: string, local: string): Promise<void> {
    const entries = await listRemote(client, sessionId, remote);
    for (const e of entries) {
      const name = e.path;
      if (!name || name === "." || name === "..") continue;
      if (SKIP_DIRS.has(name)) {
        skipped++;
        continue;
      }
      const rPath =
        remote === "/workspace" ? `/workspace/${name}` : `${remote}/${name}`;
      const lPath = join(local, name);
      if (e.kind === "directory") {
        await mkdir(lPath, { recursive: true });
        await walk(rPath, lPath);
        continue;
      }
      if (typeof e.size === "number" && e.size > 1_000_000) {
        skipped++;
        continue;
      }
      try {
        const { file } = await client.readFile(sessionId, rPath);
        await mkdir(dirname(lPath), { recursive: true });
        await writeFile(lPath, file.content, "utf8");
        files++;
      } catch {
        skipped++;
      }
    }
  }

  await walk(remotePath, localRoot);
  return { files, skipped };
}

/** Push local mirror files to cloud (text, size-capped). */
export async function pushFromMirror(
  client: LandaClient,
  sessionId: string,
  localRoot: string,
): Promise<{ files: number; skipped: number }> {
  let files = 0;
  let skipped = 0;

  async function walk(local: string, remote: string): Promise<void> {
    const names = await readdir(local);
    for (const name of names) {
      if (SKIP_DIRS.has(name)) {
        skipped++;
        continue;
      }
      const lPath = join(local, name);
      const st = await stat(lPath);
      const rPath =
        remote === "/workspace" ? `/workspace/${name}` : `${remote}/${name}`;
      if (st.isDirectory()) {
        await walk(lPath, rPath);
        continue;
      }
      if (st.size > 1_000_000) {
        skipped++;
        continue;
      }
      try {
        const content = await readFile(lPath, "utf8");
        await client.writeFile(sessionId, rPath, content);
        files++;
      } catch {
        skipped++;
      }
    }
  }

  await walk(localRoot, "/workspace");
  return { files, skipped };
}

/** Create or resolve cloud session for a workspace name. */
export async function ensureCloudSession(
  client: LandaClient,
  name: string,
  repo?: string,
): Promise<{ id: string; name: string; status: string; created: boolean }> {
  const { sessions } = await client.sessions();
  const existing = sessions.find(
    (s) => s.name === name || s.id === name,
  );
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      status: existing.status,
      created: false,
    };
  }
  const { session } = await client.createSession({
    name,
    repo,
    boot: false,
  });
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    created: true,
  };
}

export function relUnder(root: string, file: string): string {
  return relative(resolve(root), resolve(file));
}

export type WatchHandle = {
  stop: () => Promise<void>;
};

/**
 * Watch local mirror; debounced push to landa + periodic pull.
 * Call stop() on T3 exit for a final push.
 */
export function startCloudWatch(
  client: LandaClient,
  sessionId: string,
  localRoot: string,
  opts?: {
    debounceMs?: number;
    pullEveryMs?: number;
    quiet?: boolean;
  },
): WatchHandle {
  const debounceMs = opts?.debounceMs ?? 2000;
  const pullEveryMs = opts?.pullEveryMs ?? 45_000;
  const log = (msg: string) => {
    if (!opts?.quiet) {
      const t = new Date().toISOString().slice(11, 19);
      console.log(`[sync ${t}] ${msg}`);
    }
  };

  let stopped = false;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let pushing = false;
  let pending = false;
  let watchers: FSWatcher[] = [];

  const schedulePush = () => {
    if (stopped) return;
    pending = true;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      void doPush();
    }, debounceMs);
  };

  const doPush = async () => {
    if (stopped || pushing) return;
    if (!pending) return;
    pending = false;
    pushing = true;
    try {
      const r = await pushFromMirror(client, sessionId, localRoot);
      log(`push → cloud  ${r.files} files (${r.skipped} skipped)`);
    } catch (e) {
      log(`push error: ${e instanceof Error ? e.message : e}`);
      pending = true; // retry
    } finally {
      pushing = false;
      if (pending && !stopped) schedulePush();
    }
  };

  const doPull = async () => {
    if (stopped) return;
    try {
      const r = await pullToMirror(client, sessionId, localRoot);
      if (r.files > 0) log(`pull ← cloud  ${r.files} files`);
    } catch (e) {
      log(`pull error: ${e instanceof Error ? e.message : e}`);
    }
  };

  try {
    const w = watch(
      localRoot,
      { recursive: true },
      (_event, filename) => {
        if (!filename) {
          schedulePush();
          return;
        }
        const parts = String(filename).split(/[/\\]/);
        if (parts.some((p) => SKIP_DIRS.has(p))) return;
        schedulePush();
      },
    );
    watchers.push(w);
    log(`watching ${localRoot} (auto push on save, pull every ${pullEveryMs / 1000}s)`);
  } catch (e) {
    log(`watch failed (${e instanceof Error ? e.message : e}) — periodic push only`);
  }

  // catch-up push shortly after start (T3 may create files)
  schedulePush();
  const pullIv = setInterval(() => {
    void doPull();
  }, pullEveryMs);

  return {
    stop: async () => {
      stopped = true;
      if (pushTimer) clearTimeout(pushTimer);
      clearInterval(pullIv);
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          /* ignore */
        }
      }
      watchers = [];
      pending = true;
      pushing = false;
      try {
        const r = await pushFromMirror(client, sessionId, localRoot);
        log(`final push → cloud  ${r.files} files`);
      } catch (e) {
        log(`final push error: ${e instanceof Error ? e.message : e}`);
      }
    },
  };
}
