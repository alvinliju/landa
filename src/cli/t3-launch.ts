/**
 * Launch bundled T3 Code from monorepo folder `t3/`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** landa repo root (…/landa) */
export function landaRepoRoot(): string {
  // src/cli → ../.. | dist/cli → ../..
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

export type LaunchT3Opts = {
  base: string;
  key: string;
  sessionId?: string;
  mode?: "serve" | "start";
  host?: string;
};

/**
 * Prefer monorepo t3/; fall back to npx t3@latest.
 * Blocks until process exits.
 */
export async function launchT3(opts: LaunchT3Opts): Promise<void> {
  const t3Root = bundledT3Root();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LANDA_API_BASE: opts.base,
    LANDA_API_KEY: opts.key,
    LANDA_T3_SYNC: process.env.LANDA_T3_SYNC ?? "1",
    ...(opts.sessionId ? { LANDA_SESSION_ID: opts.sessionId } : {}),
  };

  const hasBundle = await exists(join(t3Root, "package.json"));
  if (!hasBundle) {
    console.error(`error: bundled t3 missing at ${t3Root}`);
    console.error("expected monorepo layout: landa/t3 (t3code fork)");
    throw new Error("bundled t3 not found");
  }

  const pnpm = await which("pnpm");
  if (!pnpm) {
    throw new Error(
      "pnpm is required for bundled t3 — https://pnpm.io/installation",
    );
  }

  if (!(await exists(join(t3Root, "node_modules")))) {
    console.log(`→ pnpm install in ${t3Root} (first run)…`);
    await runForeground(pnpm, ["install"], { env, cwd: t3Root });
  }

  const mode = opts.mode ?? "start";
  const binArgs =
    mode === "serve"
      ? ["serve", ...(opts.host ? ["--host", opts.host] : [])]
      : ["start"];

  console.log(`→ bundled T3 (${mode}) from ${t3Root}`);
  console.log(`  LANDA_API_BASE=${opts.base}  LANDA_T3_SYNC=${env.LANDA_T3_SYNC}`);
  console.log("");

  // 1) Prefer built bin after monorepo build
  const builtBin = join(t3Root, "apps/server/dist/bin.mjs");
  if (await exists(builtBin)) {
    await runForeground(process.execPath, [builtBin, ...binArgs], {
      env,
      cwd: join(t3Root, "apps/server"),
    });
    return;
  }

  // 2) Dev path: node strip-types on server bin (Node 22+)
  const srcBin = join(t3Root, "apps/server/src/bin.ts");
  if (await exists(srcBin)) {
    try {
      await runForeground(
        process.execPath,
        ["--experimental-strip-types", srcBin, ...binArgs],
        { env, cwd: join(t3Root, "apps/server") },
      );
      return;
    } catch (e) {
      console.warn("strip-types launch failed, trying pnpm dev:server…", e);
    }
  }

  // 3) monorepo script
  await runForeground(pnpm, ["dev:server"], { env, cwd: t3Root });
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
