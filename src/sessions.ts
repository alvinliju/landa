/**
 * landa-run v0 — stupid persistent sessions.
 *
 * Truth = directory on the API host (volume_path).
 * Live seat = Firecracker landa-agent VM.
 * stop  → pull /workspace → destroy seat → keep dir
 * start → create seat → push dir → /workspace
 */
import { spawn } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";

export function volumesRoot(): string {
  return (
    process.env.LANDA_VOLUMES ??
    join(process.env.LANDA_ROOT ?? process.cwd(), ".data/volumes")
  );
}

export function sessionVolumePath(userId: string, sessionId: string): string {
  const u = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "user";
  return join(volumesRoot(), u, sessionId);
}

export async function ensureVolume(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const entries = await readdir(path).catch(() => [] as string[]);
  if (entries.length > 0) return;
  await writeFile(
    join(path, "README-LANDA.md"),
    [
      "# landa-run workspace",
      "",
      "Persistent cloud workspace (host volume synced to guest /workspace).",
      "stop keeps this directory; destroy wipes it.",
      "",
    ].join("\n"),
    "utf8",
  );
}

/** Clone into volume (API host needs git + network). */
export async function cloneRepo(
  volumePath: string,
  repoUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await mkdir(volumePath, { recursive: true });
  const tmp = join(volumePath, "..", `.clone-${Date.now()}`);
  const r = await run("git", ["clone", "--depth", "1", repoUrl, tmp], 180_000);
  if (r.exitCode !== 0) {
    await run("rm", ["-rf", tmp], 30_000);
    return {
      ok: false,
      error: (r.stderr || r.stdout || "git clone failed").slice(0, 500),
    };
  }
  const mv = await run(
    "sh",
    ["-c", `cp -a "${tmp}/." "${volumePath}/" && rm -rf "${tmp}"`],
    60_000,
  );
  if (mv.exitCode !== 0) {
    return { ok: false, error: (mv.stderr || "copy clone failed").slice(0, 500) };
  }
  return { ok: true };
}

function sshArgs(guestIp: string, sshKey: string): string[] {
  return [
    "-i",
    sshKey,
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    `root@${guestIp}`,
  ];
}

export function defaultSshKey(): string {
  return (
    process.env.LANDA_FC_SSH_KEY ??
    join(
      process.env.LANDA_FC_ASSETS ??
        join(process.env.LANDA_ROOT ?? process.cwd(), "firecracker/assets"),
      "hello-id_rsa",
    )
  );
}

/** Host volume → guest /workspace via tar|ssh */
export async function pushWorkspace(
  volumePath: string,
  guestIp: string,
  sshKey = defaultSshKey(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureVolume(volumePath);
  try {
    await access(sshKey, constants.R_OK);
  } catch {
    return { ok: false, error: `ssh key missing: ${sshKey}` };
  }
  return pipeTarSsh({
    mode: "push",
    volumePath,
    guestIp,
    sshKey,
  });
}

/** Guest /workspace → host volume */
export async function pullWorkspace(
  volumePath: string,
  guestIp: string,
  sshKey = defaultSshKey(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  await mkdir(volumePath, { recursive: true });
  return pipeTarSsh({
    mode: "pull",
    volumePath,
    guestIp,
    sshKey,
  });
}

function pipeTarSsh(opts: {
  mode: "push" | "pull";
  volumePath: string;
  guestIp: string;
  sshKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { mode, volumePath, guestIp, sshKey } = opts;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ ok: false, error: "workspace sync timeout" });
    }, 180_000);

    let stderr = "";
    if (mode === "push") {
      const tar = spawn("tar", ["-C", volumePath, "-czf", "-", "."], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const ssh = spawn(
        "ssh",
        [
          ...sshArgs(guestIp, sshKey),
          "mkdir -p /workspace && tar -C /workspace -xzf -",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      tar.stdout?.pipe(ssh.stdin!);
      tar.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      ssh.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      ssh.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve({ ok: true });
        else
          resolve({
            ok: false,
            error: (stderr || `push exit ${code}`).slice(0, 500),
          });
      });
      tar.on("error", (e) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: String(e) });
      });
      ssh.on("error", (e) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: String(e) });
      });
    } else {
      const ssh = spawn(
        "ssh",
        [
          ...sshArgs(guestIp, sshKey),
          "tar -C /workspace -czf - . 2>/dev/null || true",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const tar = spawn("tar", ["-C", volumePath, "-xzf", "-"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      ssh.stdout?.pipe(tar.stdin!);
      ssh.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      tar.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      tar.on("close", (code) => {
        clearTimeout(timeout);
        // empty workspace may yield weird codes; treat as ok if no hard fail
        if (code === 0 || code === null) resolve({ ok: true });
        else
          resolve({
            ok: false,
            error: (stderr || `pull exit ${code}`).slice(0, 500),
          });
      });
      ssh.on("error", (e) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: String(e) });
      });
      tar.on("error", (e) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: String(e) });
      });
    }
  });
}

export function parseGuestIp(
  endpoints?: { ssh?: string } | null,
  guestIp?: string | null,
): string | null {
  if (guestIp) return guestIp;
  const ssh = endpoints?.ssh;
  if (!ssh) return null;
  const m = ssh.match(/root@([\d.]+)/);
  return m?.[1] ?? null;
}

function run(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      resolve({ exitCode: 124, stdout, stderr: stderr + "\ntimeout" });
    }, timeoutMs);
    p.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    p.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ exitCode: 1, stdout, stderr: String(e) });
    });
  });
}
