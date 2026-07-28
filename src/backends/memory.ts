import { randomUUID } from "node:crypto";
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
  ComputerNotFoundError,
  ComputerNotRunningError,
  FileNotFoundError,
  UnsupportedError,
} from "../errors.js";

type Seat = {
  info: ComputerInfo;
  fs: Map<string, string>;
  cwd: string;
  env: Record<string, string>;
};

/**
 * In-process fake computer — no Docker, no KVM.
 * Full contract surface so agents/UI can develop offline.
 */
export class MemoryBackend implements ComputerBackend {
  readonly name = "memory" as const;
  private seats = new Map<ComputerId, Seat>();

  async create(spec: ComputerSpec): Promise<ComputerInfo> {
    const id = `mem_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const cwd = spec.workdir ?? "/home/agent";
    const now = new Date().toISOString();
    const info: ComputerInfo = {
      id,
      status: "running",
      createdAt: now,
      updatedAt: now,
      backend: this.name,
      spec: { ...spec, backend: this.name },
      endpoints: {
        mcp: `landa://memory/${id}`,
      },
    };
    const fs = new Map<string, string>();
    fs.set(
      `${cwd}/README.md`,
      `# landa seat ${id}\n\nmemory backend — no isolation.\n`,
    );
    this.seats.set(id, {
      info,
      fs,
      cwd,
      env: { HOME: cwd, USER: "agent", ...(spec.env ?? {}) },
    });
    return { ...info };
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
    const cmd = req.cmd.trim();
    const cwd = req.cwd ? this.resolve(seat.cwd, req.cwd) : seat.cwd;

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    // support simple "a; b" chains for world snapshot sensors
    if (cmd.includes(";") && !cmd.includes("|") && !cmd.includes("&&")) {
      const parts = cmd.split(";").map((p) => p.trim()).filter(Boolean);
      const outs: string[] = [];
      for (const part of parts) {
        const r = await this.execOne(seat, part, cwd);
        outs.push(r.stdout.replace(/\n$/, ""));
        if (r.exitCode !== 0) {
          return {
            exitCode: r.exitCode,
            stdout: outs.filter(Boolean).join("\n") + (outs.length ? "\n" : ""),
            stderr: r.stderr,
            durationMs: Date.now() - start,
          };
        }
      }
      stdout = outs.filter(Boolean).join("\n") + "\n";
      return { exitCode: 0, stdout, stderr: "", durationMs: Date.now() - start };
    }

    const r = await this.execOne(seat, cmd, cwd);
    return { ...r, durationMs: Date.now() - start };
  }

  private async execOne(
    seat: Seat,
    cmd: string,
    cwd: string,
  ): Promise<Omit<ExecResult, "durationMs"> & { durationMs?: number }> {
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    if (cmd === "true" || cmd === ":") {
      // ok
    } else if (cmd === "false") {
      exitCode = 1;
    } else if (cmd === "pwd") {
      stdout = cwd + "\n";
    } else if (cmd === "whoami") {
      stdout = "agent\n";
    } else if (cmd === "uname" || cmd === "uname -a") {
      stdout = "Linux landa-memory 0.0.1 #1 SMP landa\n";
    } else if (cmd.startsWith("echo ") || cmd === "echo") {
      const arg = cmd === "echo" ? "" : cmd.slice(5);
      // strip simple quotes
      stdout = arg.replace(/^['"]|['"]$/g, "") + "\n";
    } else if (cmd.startsWith("ls")) {
      const arg = cmd.replace(/^ls\b/, "").trim();
      const target = arg
        ? this.resolve(cwd, arg.replace(/^-la\s*/, "").replace(/^-l\s*/, "").trim() || ".")
        : cwd;
      const prefix = target.endsWith("/") ? target.slice(0, -1) : target;
      const names = new Set<string>();
      for (const p of seat.fs.keys()) {
        if (p === prefix) continue;
        if (!p.startsWith(prefix + "/") && prefix !== "/") continue;
        const rest = prefix === "/" ? p.slice(1) : p.slice(prefix.length + 1);
        const name = rest.split("/")[0];
        if (name) names.add(name);
      }
      const listing = [...names].sort();
      if (cmd.includes("-l") || cmd.includes("-la")) {
        stdout =
          ["total " + listing.length, ...listing.map((n) => {
            const full = prefix === "/" ? `/${n}` : `${prefix}/${n}`;
            const isDir = [...seat.fs.keys()].some(
              (p) => p.startsWith(full + "/") || (p !== full && p.startsWith(full)),
            ) && !seat.fs.has(full);
            const mode = isDir || [...seat.fs.keys()].some((p) => p.startsWith(full + "/"))
              ? "drwxr-xr-x"
              : "-rw-r--r--";
            const size = seat.fs.get(full)?.length ?? 0;
            return `${mode} 1 agent agent ${size} ${n}`;
          })].join("\n") + "\n";
      } else {
        stdout = listing.join("\n") + (listing.length ? "\n" : "");
      }
    } else if (cmd.startsWith("cat ")) {
      const path = this.resolve(cwd, cmd.slice(4).trim());
      const content = seat.fs.get(path);
      if (content === undefined) {
        stderr = `cat: ${path}: No such file or directory\n`;
        exitCode = 1;
      } else {
        stdout = content.endsWith("\n") ? content : content + "\n";
      }
    } else if (cmd.startsWith("cd ")) {
      const next = this.resolve(cwd, cmd.slice(3).trim());
      seat.cwd = next;
      stdout = "";
    } else if (cmd.startsWith("mkdir ")) {
      // virtual dirs implied by file paths — no-op success
      stdout = "";
    } else if (cmd === "env" || cmd === "printenv") {
      stdout =
        Object.entries({ ...seat.env })
          .map(([k, v]) => `${k}=${v}`)
          .join("\n") + "\n";
    } else {
      stderr = `memory backend: unsupported cmd: ${cmd}\n`;
      exitCode = 127;
    }

    return { exitCode, stdout, stderr };
  }

  async writeFile(id: ComputerId, file: FileWrite): Promise<void> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const path = this.resolve(seat.cwd, file.path);
    const content =
      typeof file.content === "string"
        ? file.content
        : new TextDecoder().decode(file.content);
    seat.fs.set(path, content);
  }

  async readFile(id: ComputerId, path: string): Promise<FileRead> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const full = this.resolve(seat.cwd, path);
    const content = seat.fs.get(full);
    if (content === undefined) {
      throw new FileNotFoundError(full);
    }
    return { path: full, content };
  }

  async listFiles(id: ComputerId, path = "."): Promise<FileEntry[]> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const base = this.resolve(seat.cwd, path);
    const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
    const entries = new Map<string, FileEntry>();

    for (const [p, content] of seat.fs) {
      if (p === prefix) {
        entries.set(p, { path: p, kind: "file", size: content.length });
        continue;
      }
      if (!p.startsWith(prefix + "/") && !(prefix === "/" && p.startsWith("/"))) {
        continue;
      }
      const rest = prefix === "/" ? p.slice(1) : p.slice(prefix.length + 1);
      const name = rest.split("/")[0]!;
      const full = prefix === "/" ? `/${name}` : `${prefix}/${name}`;
      if (rest.includes("/")) {
        entries.set(full, { path: full, kind: "directory" });
      } else {
        entries.set(full, { path: full, kind: "file", size: content.length });
      }
    }
    return [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  async checkpoint(_id: ComputerId, _label?: string): Promise<string> {
    throw new UnsupportedError("checkpoint", this.name);
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

  private resolve(cwd: string, path: string): string {
    if (!path || path === ".") return cwd;
    if (path.startsWith("/")) return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const joined = `${cwd.replace(/\/$/, "")}/${path}`;
    return joined.replace(/\/+/g, "/");
  }
}
