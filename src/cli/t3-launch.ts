/**
 * Launch bundled T3 from monorepo `t3/`.
 *
 * Cloud workspaces: pre-register project via `t3 project add <mirror>`, then
 * `t3 start --base-dir <per-session-t3-home> <mirror>` so the UI has a project.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { access, constants, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function landaRepoRoot(): string {
  return join(here, "..", "..");
}

export function bundledT3Root(repoRoot = landaRepoRoot()): string {
  return process.env.LANDA_T3_ROOT?.trim() || join(repoRoot, "t3");
}

/** Isolated T3 sqlite/state per landa session (or "default"). */
export function t3HomeForSession(sessionId?: string): string {
  const id = sessionId || "default";
  return join(homedir(), ".cache", "landa", "t3-home", id);
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
  if (await exists(join(t3Root, "apps/server/node_modules/@effect/platform-node")))
    return true;
  return false;
}

function nodeEngineOk(version: string): boolean {
  const m = version.replace(/^v/, "").split(".");
  const major = Number(m[0] || 0);
  const minor = Number(m[1] || 0);
  if (major === 22 && minor >= 16) return true;
  if (major === 23 && minor >= 11) return true;
  if (major > 24) return true;
  if (major === 24 && minor >= 10) return true;
  return false;
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

/** t3 CLI via pnpm --filter t3 exec */
async function t3Cli(
  pnpm: string,
  t3Root: string,
  env: NodeJS.ProcessEnv,
  args: string[],
): Promise<void> {
  await runForeground(
    pnpm,
    ["--filter", "t3", "exec", "node", "--experimental-strip-types", "src/bin.ts", ...args],
    { env, cwd: t3Root },
  );
}

/** Ensure mirror looks like a real project so agents/T3 are happy. */
async function seedMirrorProject(mirror: string, title: string): Promise<void> {
  await mkdir(mirror, { recursive: true });
  const pkg = join(mirror, "package.json");
  if (!(await exists(pkg))) {
    await writeFile(
      pkg,
      JSON.stringify(
        {
          name: title.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase() || "landa-workspace",
          private: true,
          description: "landa cloud workspace mirror",
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }
}

export type LaunchT3Opts = {
  base: string;
  key: string;
  sessionId?: string;
  sessionName?: string;
  mode?: "serve" | "start";
  host?: string;
  workspaceCwd?: string;
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
  if (!pnpm) throw new Error("pnpm required — brew install pnpm");

  if (!(await t3DepsReady(t3Root))) {
    console.log(`→ pnpm install in ${t3Root}…`);
    await runForeground(pnpm, ["install"], { env, cwd: t3Root });
    if (!(await t3DepsReady(t3Root))) {
      throw new Error("pnpm install incomplete — re-run after fixing errors");
    }
  }

  const mode = opts.mode ?? "start";
  const mirror = opts.workspaceCwd;
  const t3Home = t3HomeForSession(opts.sessionId);
  await mkdir(t3Home, { recursive: true });

  // Per-session T3 state so projects don't collide with ~/Documents/landa
  env.T3CODE_HOME = t3Home;

  if (mirror) {
    const title = opts.sessionName
      ? `landa:${opts.sessionName}`
      : `landa:${opts.sessionId?.slice(0, 8) ?? "workspace"}`;
    await seedMirrorProject(mirror, title);

    console.log(`→ register T3 project at mirror`);
    console.log(`  workspace: ${mirror}`);
    console.log(`  t3 home:   ${t3Home}`);
    try {
      await t3Cli(pnpm, t3Root, env, [
        "project",
        "add",
        mirror,
        "--title",
        title,
        "--base-dir",
        t3Home,
      ]);
    } catch (e) {
      // already exists is fine
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists|Added project/i.test(msg)) {
        console.warn("  project add:", msg);
      }
    }
  }

  console.log(`→ bundled T3 (${mode})`);
  console.log(`  LANDA_API_BASE=${opts.base}`);
  if (mirror) console.log(`  project cwd=${mirror}`);
  console.log("");

  if (mode === "serve") {
    console.log("  headless — use pairing URL on the API port (not :5733 unless Vite runs)");
    await t3Cli(pnpm, t3Root, env, [
      "serve",
      "--base-dir",
      t3Home,
      "--auto-bootstrap-project-from-cwd",
      ...(opts.host ? ["--host", opts.host] : []),
      ...(mirror ? [mirror] : []),
    ]);
    return;
  }

  // start: server + open browser; project already registered
  console.log("  open the pairing / app URL T3 prints");
  console.log("  (dev UI may be :5733; server often :3773 or :13773)");
  console.log("");

  try {
    await t3Cli(pnpm, t3Root, env, [
      "start",
      "--base-dir",
      t3Home,
      "--auto-bootstrap-project-from-cwd",
      ...(mirror ? [mirror] : []),
    ]);
    return;
  } catch (e) {
    console.warn("t3 start exited; falling back to pnpm dev for full UI…");
    console.warn(String(e instanceof Error ? e.message : e));
  }

  // Full Vite UI — still use isolated T3CODE_HOME
  console.log("  full stack pnpm dev → web :5733 + server :13773");
  console.log("  open http://localhost:5733/pair#token=… when shown");
  console.log("");
  await runForeground(pnpm, ["dev"], {
    env: {
      ...env,
      T3CODE_HOME: t3Home,
      T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: mirror ? "1" : "0",
      ...(mirror ? { T3CODE_BOOTSTRAP_CWD: mirror } : {}),
    },
    cwd: t3Root,
  });
}
