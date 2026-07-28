import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile as fsWriteFile, readFile as fsReadFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ComputerBackend,
  ComputerId,
  ComputerInfo,
  ComputerSpec,
  ExecRequest,
  ExecResult,
  FileEntry,
  FileRead,
  FileWrite,
} from "../types.js";
import {
  BackendError,
  ComputerNotFoundError,
  ComputerNotRunningError,
  FileNotFoundError,
} from "../errors.js";

type Seat = {
  info: ComputerInfo;
  container: string;
};

const DEFAULT_IMAGE = process.env.LANDA_DOCKER_IMAGE ?? "alpine:3.20";
const NAME_PREFIX = "landa-";

/**
 * Real computer via Docker — first isolation backend that is not a fake.
 *
 * create  → docker run -d --name landa-<id> <image> sleep infinity
 * exec    → docker exec
 * files   → docker cp
 * destroy → docker rm -f
 */
export class DockerBackend implements ComputerBackend {
  readonly name = "docker" as const;
  private seats = new Map<ComputerId, Seat>();
  private readonly image: string;

  constructor(opts?: { image?: string }) {
    this.image = opts?.image ?? DEFAULT_IMAGE;
  }

  async create(spec: ComputerSpec): Promise<ComputerInfo> {
    const id = `dck_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const container = `${NAME_PREFIX}${id}`;
    const image = spec.image ?? this.image;
    const workdir = spec.workdir ?? "/home/agent";
    const now = new Date().toISOString();

    const info: ComputerInfo = {
      id,
      status: "creating",
      createdAt: now,
      updatedAt: now,
      backend: this.name,
      spec: { ...spec, backend: this.name, image },
      endpoints: { container },
    };
    this.seats.set(id, { info, container });

    try {
      await this.docker([
        "run",
        "-d",
        "--name",
        container,
        "--label",
        "landa.seat=1",
        "--label",
        `landa.id=${id}`,
        "-w",
        workdir,
        ...envFlags(spec.env),
        image,
        "sleep",
        "infinity",
      ]);
      // ensure workdir exists
      await this.docker(
        ["exec", container, "sh", "-c", `mkdir -p '${workdir}' && echo 'landa docker seat ${id}' > '${workdir}/README.md'`],
        { allowFail: true },
      );

      info.status = "running";
      info.updatedAt = new Date().toISOString();
      return { ...info };
    } catch (e) {
      info.status = "error";
      info.error = String(e);
      info.updatedAt = new Date().toISOString();
      await this.docker(["rm", "-f", container], { allowFail: true });
      this.seats.delete(id);
      throw new BackendError(this.name, `docker create failed: ${e}`, { id });
    }
  }

  async get(id: ComputerId): Promise<ComputerInfo | null> {
    const s = this.seats.get(id);
    return s ? { ...s.info } : null;
  }

  async list(): Promise<ComputerInfo[]> {
    return [...this.seats.values()]
      .filter((s) => s.info.status !== "destroyed")
      .map((s) => ({ ...s.info }));
  }

  async destroy(id: ComputerId): Promise<void> {
    const seat = this.seats.get(id);
    if (!seat) return;
    await this.docker(["rm", "-f", seat.container], { allowFail: true });
    seat.info = {
      ...seat.info,
      status: "destroyed",
      updatedAt: new Date().toISOString(),
    };
    this.seats.delete(id);
  }

  async pause(id: ComputerId): Promise<void> {
    const seat = this.need(id);
    this.requireRunning(seat);
    await this.docker(["pause", seat.container]);
    seat.info = {
      ...seat.info,
      status: "paused",
      updatedAt: new Date().toISOString(),
    };
  }

  async resume(id: ComputerId): Promise<void> {
    const seat = this.need(id);
    if (seat.info.status !== "paused") {
      throw new ComputerNotRunningError(id, seat.info.status);
    }
    await this.docker(["unpause", seat.container]);
    seat.info = {
      ...seat.info,
      status: "running",
      updatedAt: new Date().toISOString(),
    };
  }

  async exec(id: ComputerId, req: ExecRequest): Promise<ExecResult> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? 60_000;
    const workdir = req.cwd ?? seat.info.spec.workdir ?? "/home/agent";

    const args = ["exec", "-w", workdir];
    if (req.env) {
      for (const [k, v] of Object.entries(req.env)) {
        args.push("-e", `${k}=${v}`);
      }
    }
    args.push(seat.container, "sh", "-c", req.cmd);

    try {
      const { code, stdout, stderr } = await this.dockerRaw(args, { timeoutMs });
      return {
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: String(e),
        durationMs: Date.now() - start,
      };
    }
  }

  async writeFile(id: ComputerId, file: FileWrite): Promise<void> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const dest = file.path.startsWith("/")
      ? file.path
      : `${(seat.info.spec.workdir ?? "/home/agent").replace(/\/$/, "")}/${file.path}`;

    const tmp = await mkdtemp(join(tmpdir(), "landa-w-"));
    try {
      const local = join(tmp, "blob");
      if (typeof file.content === "string") {
        await fsWriteFile(local, file.content, "utf8");
      } else {
        await fsWriteFile(local, file.content);
      }
      if (file.mkdir !== false) {
        const dir = dest.includes("/") ? dest.slice(0, dest.lastIndexOf("/")) : ".";
        await this.docker(
          ["exec", seat.container, "sh", "-c", `mkdir -p '${dir}'`],
          { allowFail: true },
        );
      }
      await this.docker(["cp", local, `${seat.container}:${dest}`]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  async readFile(id: ComputerId, path: string): Promise<FileRead> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const full = path.startsWith("/")
      ? path
      : `${(seat.info.spec.workdir ?? "/home/agent").replace(/\/$/, "")}/${path}`;

    const tmp = await mkdtemp(join(tmpdir(), "landa-r-"));
    try {
      const local = join(tmp, "blob");
      const r = await this.dockerRaw(["cp", `${seat.container}:${full}`, local], {
        timeoutMs: 30_000,
      });
      if (r.code !== 0) {
        throw new FileNotFoundError(full);
      }
      const content = await fsReadFile(local, "utf8");
      return { path: full, content };
    } catch (e) {
      if (e instanceof FileNotFoundError) throw e;
      throw new FileNotFoundError(full);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  async listFiles(id: ComputerId, path = "."): Promise<FileEntry[]> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const r = await this.exec(id, {
      cmd: `ls -la ${shellQuote(path)} 2>/dev/null | tail -n +2`,
      timeoutMs: 15_000,
    });
    if (r.exitCode !== 0) return [];
    const entries: FileEntry[] = [];
    for (const line of r.stdout.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(/\s+/);
      if (parts.length < 9) continue;
      const mode = parts[0]!;
      const size = Number(parts[4]) || 0;
      const name = parts.slice(8).join(" ");
      if (name === "." || name === "..") continue;
      const kind = mode.startsWith("d")
        ? "directory"
        : mode.startsWith("-")
          ? "file"
          : "other";
      entries.push({ path: name, kind, size });
    }
    return entries;
  }

  private need(id: ComputerId): Seat {
    const seat = this.seats.get(id);
    if (!seat) throw new ComputerNotFoundError(id);
    return seat;
  }

  private requireRunning(seat: Seat): void {
    if (seat.info.status !== "running") {
      throw new ComputerNotRunningError(seat.info.id, seat.info.status);
    }
  }

  private async docker(
    args: string[],
    opts?: { allowFail?: boolean; timeoutMs?: number },
  ): Promise<string> {
    const r = await this.dockerRaw(args, opts);
    if (r.code !== 0 && !opts?.allowFail) {
      throw new BackendError(
        this.name,
        `docker ${args[0]} failed (${r.code}): ${r.stderr || r.stdout}`,
      );
    }
    return r.stdout;
  }

  private dockerRaw(
    args: string[],
    opts?: { timeoutMs?: number; allowFail?: boolean },
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer =
        opts?.timeoutMs && opts.timeoutMs > 0
          ? setTimeout(() => {
              child.kill("SIGKILL");
              reject(new BackendError(this.name, `docker timed out: ${args.join(" ")}`));
            }, opts.timeoutMs)
          : null;

      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        reject(new BackendError(this.name, `docker spawn failed: ${err.message}`));
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  }
}

function envFlags(env?: Record<string, string>): string[] {
  if (!env) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    out.push("-e", `${k}=${v}`);
  }
  return out;
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** true if docker CLI responds */
export async function dockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["info"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
