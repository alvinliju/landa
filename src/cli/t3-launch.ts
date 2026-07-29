/**
 * Launch bundled T3 Code from monorepo folder `t3/`.
 *
 * Architecture (dev):
 *   server  http://127.0.0.1:13773  (WebSocket + API)
 *   web     http://127.0.0.1:5733   (Vite UI — REQUIRED for browser)
 *
 * `pnpm dev:server` only starts :13773 → Firefox "can't connect to :5733".
 * We must use `pnpm dev` (server + web) for local laptop GUI.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function landaRepoRoot(): string {
  return join(here, "..", "..");
}

export function bundledT3Root(repoRoot = landaRepoRoot()): string {
  return process.env.LANDA_T3_ROOT?.trim() || join(repoRoot, "t3");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    p.on("close", (code) => {
      resolve(code === 0 ? out.trim().split("\n")[0] || null : null);
    });
    p.on("error", () => resolve(null));
  });
}

async function t3DepsReady(t3Root: string): Promise<boolean> {
  if (await exists(join(t3Root, "node_modules/.modules.yaml"))) return true;
  if (await exists(join(t3Root, "node_modules/@effect/platform-node"))) return true;
  if (
    await exists(join(t3Root, "apps/server/node_modules/@effect/platform-node"))
  )
    return true;
  return false;
}

function parseNodeMajorMinor(v: string): { major: number; minor: number } {
  const m = v.replace(/^v/, "").split(".");
  return { major: Number(m[0] || 0), minor: Number(m[1] || 0) };
}

function nodeEngineOk(version: string): boolean {
  const { major, minor } = parseNodeMajorMinor(version);
  if (major === 22 && minor >= 16) return true;
  if (major === 23 && minor >= 11) return true;
  if (major > 24) return true;
  if (major === 24 && minor >= 10) return true;
  return false;
}

export type LaunchT3Opts = {
  base: string;
  key: string;
  sessionId?: string;
  /**
   * start  = full local GUI (pnpm dev: server :13773 + web :5733)
   * serve  = headless API only (pair remote client; no Vite)
   */
  mode?: "serve" | "start";
  host?: string;
};

export async function launchT3(opts: LaunchT3Opts): Promise<void> {
  const t3Root = bundledT3Root();
  const nodeV = process.version;

  if (!nodeEngineOk(nodeV)) {
    console.error(`Node ${nodeV} is below T3's floor (need >=24.10 or 22.16+/23.11+).`);
    console.error("  brew upgrade node   # or nvm install 24.13");
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LANDA_API_BASE: opts.base,
    LANDA_API_KEY: opts.key,
    LANDA_T3_SYNC: process.env.LANDA_T3_SYNC ?? "1",
    ...(opts.sessionId ? { LANDA_SESSION_ID: opts.sessionId } : {}),
  };

  if (!(await exists(join(t3Root, "package.json")))) {
    throw new Error(`bundled t3 missing at ${t3Root}`);
  }

  const pnpm = await which("pnpm");
  if (!pnpm) {
    throw new Error("pnpm required — brew install pnpm");
  }

  if (!(await t3DepsReady(t3Root))) {
    console.log(`→ pnpm install in ${t3Root}…`);
    await runForeground(pnpm, ["install"], { env, cwd: t3Root });
    if (!(await t3DepsReady(t3Root))) {
      throw new Error("pnpm install incomplete — @effect packages still missing");
    }
  }

  const mode = opts.mode ?? "start";

  console.log(`→ bundled T3 (${mode}) from ${t3Root}`);
  console.log(`  LANDA_API_BASE=${opts.base}`);
  console.log("");

  if (mode === "serve") {
    // Headless: only backend. Pair with desktop/phone — no Vite on :5733.
    console.log("  headless serve — open the pairing URL the server prints");
    console.log("  (API default ~http://127.0.0.1:13773 or :3773, NOT :5733)");
    console.log("");
    await runForeground(
      pnpm,
      [
        "--filter",
        "t3",
        "exec",
        "node",
        "--experimental-strip-types",
        "src/bin.ts",
        "serve",
        ...(opts.host ? ["--host", opts.host] : []),
      ],
      { env, cwd: t3Root },
    );
    return;
  }

  // Full local GUI: MUST start Vite web (:5733) + server (:13773).
  // `dev:server` alone = only API → browser fails on localhost:5733.
  console.log("  full stack:");
  console.log("    server  http://127.0.0.1:13773  (API / WebSocket)");
  console.log("    web     http://127.0.0.1:5733   (UI — open this)");
  console.log("");
  console.log("  Wait until BOTH are up, then open the pairing URL, e.g.");
  console.log("    http://localhost:5733/pair#token=…");
  console.log("  If web never starts, try: cd t3 && pnpm dev");
  console.log("");

  await runForeground(pnpm, ["dev"], { env, cwd: t3Root });
}

function runForeground(
  cmd: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; cwd: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(cmd, args, {
      stdio: "inherit",
      env: opts.env,
      cwd: opts.cwd,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve();
        return;
      }
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}
