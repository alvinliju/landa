/**
 * Launch bundled T3 Code from monorepo folder `t3/`.
 *
 * Why bare `node apps/server/src/bin.ts` fails:
 *   T3 is a pnpm workspace. Deps like @effect/platform-node live in
 *   t3/node_modules/.pnpm and are linked into package node_modules.
 *   Running node on a source file before `pnpm install` finishes (or
 *   without going through pnpm's package context) → ERR_MODULE_NOT_FOUND.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { access, constants, readFile } from "node:fs/promises";
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

/** True only when pnpm install has linked workspace deps. */
async function t3DepsReady(t3Root: string): Promise<boolean> {
  // modules.yaml is written at end of successful pnpm install
  if (await exists(join(t3Root, "node_modules/.modules.yaml"))) return true;
  // symlink or real package
  if (await exists(join(t3Root, "node_modules/@effect/platform-node")))
    return true;
  if (
    await exists(
      join(t3Root, "apps/server/node_modules/@effect/platform-node"),
    )
  )
    return true;
  return false;
}

function parseNodeMajorMinor(v: string): { major: number; minor: number } {
  const m = v.replace(/^v/, "").split(".");
  return { major: Number(m[0] || 0), minor: Number(m[1] || 0) };
}

/** T3 server engines: ^22.16 || ^23.11 || >=24.10 */
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
  mode?: "serve" | "start";
  host?: string;
};

export async function launchT3(opts: LaunchT3Opts): Promise<void> {
  const t3Root = bundledT3Root();
  const nodeV = process.version;

  if (!nodeEngineOk(nodeV)) {
    console.error("");
    console.error(`Node ${nodeV} is too old for bundled T3.`);
    console.error("  need:  ^22.16  or  ^23.11  or  >=24.10");
    console.error("  you:   " + nodeV);
    console.error("");
    console.error("  brew install node@24   # or nvm install 24.13");
    console.error("  # then re-run: npm run t3");
    console.error("");
    // monorepo root may also want 24.13.1 — warn only
  } else {
    const { major, minor } = parseNodeMajorMinor(nodeV);
    if (major === 24 && minor < 13) {
      console.warn(
        `note: monorepo prefers Node ^24.13.1 (you have ${nodeV}) — usually fine`,
      );
    }
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LANDA_API_BASE: opts.base,
    LANDA_API_KEY: opts.key,
    LANDA_T3_SYNC: process.env.LANDA_T3_SYNC ?? "1",
    ...(opts.sessionId ? { LANDA_SESSION_ID: opts.sessionId } : {}),
  };

  if (!(await exists(join(t3Root, "package.json")))) {
    throw new Error(
      `bundled t3 missing at ${t3Root} — expected landa/t3 (t3code fork)`,
    );
  }

  const pnpm = await which("pnpm");
  if (!pnpm) {
    throw new Error(
      "pnpm is required — https://pnpm.io/installation (brew install pnpm)",
    );
  }

  if (!(await t3DepsReady(t3Root))) {
    console.log(`→ pnpm install in ${t3Root} (first complete install)…`);
    console.log("  this can take a few minutes");
    await runForeground(pnpm, ["install"], { env, cwd: t3Root });
    if (!(await t3DepsReady(t3Root))) {
      throw new Error(
        "pnpm install finished but @effect/platform-node still missing — check t3/ install logs",
      );
    }
  }

  const mode = opts.mode ?? "start";
  const binArgs =
    mode === "serve"
      ? ["serve", ...(opts.host ? ["--host", opts.host] : [])]
      : ["start"];

  console.log(`→ bundled T3 (${mode}) via pnpm — ${t3Root}`);
  console.log(`  LANDA_API_BASE=${opts.base}`);
  console.log("");

  // Always use pnpm package context so workspace deps resolve.
  // Prefer source entry (no separate build step).
  const filterArgs = [
    "--filter",
    "t3",
    "exec",
    "node",
    "--experimental-strip-types",
    "src/bin.ts",
    ...binArgs,
  ];

  try {
    await runForeground(pnpm, filterArgs, { env, cwd: t3Root });
    return;
  } catch (e) {
    console.warn("pnpm --filter t3 exec failed, trying monorepo dev:server…");
    console.warn(String(e instanceof Error ? e.message : e));
  }

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

/** Exported for tests / diagnostics */
export async function diagnoseT3(): Promise<string> {
  const t3Root = bundledT3Root();
  const lines = [
    `t3Root=${t3Root}`,
    `node=${process.version} ok=${nodeEngineOk(process.version)}`,
    `package.json=${await exists(join(t3Root, "package.json"))}`,
    `depsReady=${await t3DepsReady(t3Root)}`,
  ];
  try {
    const pkg = JSON.parse(
      await readFile(join(t3Root, "package.json"), "utf8"),
    ) as { name?: string };
    lines.push(`name=${pkg.name}`);
  } catch {
    lines.push("name=?");
  }
  return lines.join("\n");
}
