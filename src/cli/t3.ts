/**
 * landa t3 — login → cloud workspace (optional) → console → launch T3.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "./config.js";
import {
  ensureCloudSession,
  ensureLocalMirror,
  isCloudSyncOn,
  pullToMirror,
  writeCloudMarker,
} from "./cloud-sync.js";
import { ensureLoggedIn } from "./login.js";
import { openSession } from "./open.js";
import { ask } from "./prompt.js";
import { bundledT3Root, launchT3 } from "./t3-launch.js";

function openBrowser(url: string): void {
  const plat = process.platform;
  const cmd =
    plat === "darwin" ? "open" : plat === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* ignore */
  }
}

export type T3Opts = {
  key?: string;
  base?: string;
  session?: string;
  launch?: boolean;
  serve?: boolean;
  browser?: boolean;
  mode?: "serve" | "start";
  noLaunch?: boolean;
  /** force cloud sync on/off for this run */
  cloud?: boolean;
  /** create new cloud workspace name */
  newWorkspace?: string;
  repo?: string;
};

export async function runT3(opts: T3Opts = {}): Promise<void> {
  const cfg = await loadConfig();
  const cloud =
    opts.cloud !== undefined ? opts.cloud : isCloudSyncOn(cfg);

  console.log("");
  console.log("landa t3 — host-first sessions + bundled agent harness");
  console.log(`  t3 bundle:  ${bundledT3Root()}`);
  console.log(
    `  cloud sync: ${cloud ? "ON  (workspaces = landa sessions)" : "OFF (local T3 cwd)"}`,
  );
  console.log(
    `  toggle:     landa config set cloud-sync on|off`,
  );
  console.log("");

  const { base, key, client } = await ensureLoggedIn({
    key: opts.key,
    base: opts.base,
  });

  const { sessions } = await client.sessions();
  console.log(`sessions (${sessions.length})  editMode=host-first`);
  if (!sessions.length) {
    console.log("  (none yet)");
  } else {
    for (const s of sessions) {
      console.log(
        `  ${s.status.padEnd(10)} ${s.name.padEnd(22)} ${s.id.slice(0, 8)}…  via=${s.filesVia ?? "?"}`,
      );
    }
  }
  console.log("");

  let sessionId = opts.session;
  let sessionName = "";
  let mirrorPath: string | undefined;

  if (cloud) {
    // Cloud mode: always bind a landa session as home
    if (opts.newWorkspace) {
      const created = await ensureCloudSession(
        client,
        opts.newWorkspace,
        opts.repo,
      );
      sessionId = created.id;
      sessionName = created.name;
      console.log(
        created.created
          ? `✓ created cloud workspace "${created.name}"`
          : `→ reusing cloud workspace "${created.name}"`,
      );
    } else if (!sessionId && sessions.length === 0) {
      const name =
        opts.newWorkspace ||
        cfg.defaultWorkspace ||
        (await ask("new cloud workspace name", { default: "main" }));
      const repo = await ask("git repo URL (optional)");
      const created = await ensureCloudSession(client, name || "main", repo || undefined);
      sessionId = created.id;
      sessionName = created.name;
      console.log(`✓ cloud workspace "${created.name}" (${created.id.slice(0, 8)}…)`);
    } else if (!sessionId && sessions.length === 1) {
      sessionId = sessions[0]!.id;
      sessionName = sessions[0]!.name;
      console.log(`→ cloud workspace: ${sessionName}`);
    } else if (!sessionId) {
      const pick = await ask("cloud workspace (name or id)", {
        default: sessions[0]?.name ?? cfg.defaultWorkspace ?? "main",
      });
      const resolved = await client.resolveSession(pick || "main");
      sessionId = resolved.id;
      sessionName = resolved.name;
    } else {
      const resolved = await client.resolveSession(sessionId);
      sessionId = resolved.id;
      sessionName = resolved.name;
    }

    const session = { id: sessionId, name: sessionName };
    console.log("");
    console.log("╭─ cloud sync ────────────────────────────────");
    console.log("│ mode     ON — truth = landa host volume");
    console.log(`│ session  ${sessionName} (${sessionId})`);
    await writeCloudMarker(client, session, base);
    mirrorPath = await ensureLocalMirror(session, base);
    console.log(`│ mirror   ${mirrorPath}`);
    console.log("│ pull     syncing cloud → local mirror…");
    const pulled = await pullToMirror(client, sessionId, mirrorPath);
    console.log(`│          ${pulled.files} files (${pulled.skipped} skipped)`);
    console.log("│ push     landa sync push -r " + sessionId.slice(0, 8) + "…");
    console.log("╰─────────────────────────────────────────────");
    console.log("");
  } else {
    // Local mode: optional session attach (old behavior)
    if (!sessionId && sessions.length === 1) {
      sessionId = sessions[0]!.id;
      console.log(`→ attached session: ${sessions[0]!.name} (local mode)`);
    } else if (!sessionId && sessions.length > 1) {
      const pick = await ask("attach landa session? (name/id, empty=skip)", {
        default: "",
      });
      if (pick) sessionId = pick;
    } else if (!sessionId && sessions.length === 0) {
      console.log("tip: landa config set cloud-sync on  → new workspaces on landa");
    }
  }

  const configDir = join(homedir(), ".config", "landa");
  await mkdir(configDir, { recursive: true });
  const envPath = join(configDir, "t3.env");
  await writeFile(
    envPath,
    [
      `# generated by landa t3`,
      `export LANDA_API_BASE='${base}'`,
      `export LANDA_API_KEY='${key}'`,
      `export LANDA_CLOUD_SYNC='${cloud ? "1" : "0"}'`,
      sessionId ? `export LANDA_SESSION_ID='${sessionId}'` : "",
      mirrorPath ? `export LANDA_WORKSPACE_MIRROR='${mirrorPath}'` : "",
      `export LANDA_T3_SYNC=1`,
      "",
    ]
      .filter((l) => l !== "")
      .join("\n"),
    "utf8",
  );
  await saveConfig({
    apiKey: key,
    apiBase: base,
    cloudSync: cloud,
    ...(sessionId ? { lastSession: sessionId } : {}),
  });

  if (sessionId) {
    await openSession(client, sessionId, {
      browser: opts.browser !== false,
      start: false,
    });
  } else {
    console.log(`→ console ${base}`);
    if (opts.browser !== false) openBrowser(base.replace(/\/$/, ""));
  }

  console.log(`env: source ${envPath}`);
  console.log("");

  if (opts.noLaunch === true || opts.launch === false) {
    console.log("skipping T3 launch (--no-launch).");
    return;
  }

  console.log("→ starting T3 Code (bundled)…");
  if (cloud && mirrorPath) {
    console.log("  project cwd = cloud mirror (not ~/Documents/landa)");
  }
  console.log("  Ctrl+C stops T3 (cloud session stays).");
  console.log("");

  await launchT3({
    base,
    key,
    sessionId,
    sessionName: sessionName || undefined,
    mode: opts.mode ?? "start",
    workspaceCwd: cloud ? mirrorPath : undefined,
  });
}
