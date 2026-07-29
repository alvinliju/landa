import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LandaClient, Session } from "./api.js";
import { saveConfig } from "./config.js";

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

export async function openSession(
  client: LandaClient,
  idOrName: string,
  opts: { browser?: boolean; start?: boolean } = {},
): Promise<Session> {
  const browser = opts.browser !== false;
  let session = await client.resolveSession(idOrName);

  if (opts.start && session.status !== "running") {
    console.log(`→ starting seat for ${session.name}…`);
    await client.startSession(session.id);
    session = (await client.session(session.id)).session;
  }

  await saveConfig({ lastSession: session.id });

  const consoleUrl = `${client.base}/sessions/${session.id}`;
  const envFile = join(tmpdir(), `landa-${session.id.slice(0, 8)}.env`);
  await writeFile(
    envFile,
    [
      `# landa session ${session.name}`,
      `export LANDA_API_BASE='${client.base}'`,
      `export LANDA_API_KEY='${client.apiKey}'`,
      `export LANDA_SESSION_ID='${session.id}'`,
      `export LANDA_SESSION_NAME='${session.name}'`,
      "",
    ].join("\n"),
    "utf8",
  );

  console.log("");
  console.log("╭─ landa session ─────────────────────────────");
  console.log(`│ name      ${session.name}`);
  console.log(`│ id        ${session.id}`);
  console.log(`│ status    ${session.status}`);
  console.log(`│ editMode  ${session.editMode ?? "host-first"}`);
  console.log(`│ filesVia  ${session.filesVia ?? (session.status === "running" ? "seat" : "host")}`);
  console.log(`│ repo      ${session.repoUrl || "—"}`);
  console.log(`│ guest     ${session.guestIp || "—"}`);
  console.log(`│ console   ${consoleUrl}`);
  console.log(`│ env       source ${envFile}`);
  console.log("╰─────────────────────────────────────────────");
  console.log("");

  try {
    const list = await client.listFiles(session.id, "/workspace");
    console.log(`/workspace  (via ${list.via ?? "?"})`);
    if (!list.entries?.length) {
      console.log("  (empty)");
    } else {
      for (const e of list.entries.slice(0, 40)) {
        const kind = e.kind === "directory" ? "d" : "-";
        console.log(`  ${kind} ${e.path}${typeof e.size === "number" ? `  ${e.size}b` : ""}`);
      }
      if (list.entries.length > 40) {
        console.log(`  … +${list.entries.length - 40} more`);
      }
    }
  } catch (e) {
    console.log(`  (list failed: ${e instanceof Error ? e.message : e})`);
  }

  console.log("");
  console.log("next:");
  console.log(`  landa files ls -r ${session.id}`);
  console.log(`  landa files put -r ${session.id} /workspace/x.txt ./x.txt`);
  if (session.status !== "running") {
    console.log(`  landa start -r ${session.id}     # boot seat for exec`);
  } else {
    console.log(`  landa exec -r ${session.id} -- ls -la /workspace`);
    console.log(`  landa stop -r ${session.id}`);
  }
  console.log(`  landa open -r ${session.id} --no-browser`);
  console.log("");

  if (browser) {
    console.log(`→ opening ${consoleUrl}`);
    openBrowser(consoleUrl);
  }

  return session;
}
