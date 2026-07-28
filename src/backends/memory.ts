import { randomUUID } from "node:crypto";
import type {
  ComputerBackend,
  ComputerId,
  ComputerInfo,
  ComputerSpec,
  ExecRequest,
  ExecResult,
  FileRead,
  FileWrite,
} from "../types.js";

/**
 * In-process fake computer — no Docker, no cloud.
 * Good enough to design the control plane and demo the seat contract.
 * Real isolation comes from e2b / daytona / microvm backends later.
 */
export class MemoryBackend implements ComputerBackend {
  readonly name = "memory";
  private seats = new Map<
    ComputerId,
    { info: ComputerInfo; fs: Map<string, string>; cwd: string }
  >();

  async create(spec: ComputerSpec): Promise<ComputerInfo> {
    const id = randomUUID().slice(0, 8);
    const info: ComputerInfo = {
      id,
      status: "running",
      createdAt: new Date().toISOString(),
      backend: this.name,
      spec,
      endpoints: {
        mcp: `landa://memory/${id}`,
      },
    };
    const fs = new Map<string, string>();
    fs.set("/home/agent/README.md", `# landa seat ${id}\n\nmemory backend — not isolated.\n`);
    this.seats.set(id, { info, fs, cwd: "/home/agent" });
    return info;
  }

  async get(id: ComputerId): Promise<ComputerInfo | null> {
    return this.seats.get(id)?.info ?? null;
  }

  async list(): Promise<ComputerInfo[]> {
    return [...this.seats.values()].map((s) => s.info);
  }

  async destroy(id: ComputerId): Promise<void> {
    this.seats.delete(id);
  }

  async exec(id: ComputerId, req: ExecRequest): Promise<ExecResult> {
    const seat = this.need(id);
    const start = Date.now();
    const cmd = req.cmd.trim();

    // tiny fake shell — enough for demos and tests
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    if (cmd === "pwd") {
      stdout = seat.cwd + "\n";
    } else if (cmd.startsWith("whoami")) {
      stdout = "agent\n";
      if (cmd.includes("uname") || cmd.includes(";")) {
        stdout += "Linux landa-memory 0.0.1\n";
      }
    } else if (cmd.startsWith("ls")) {
      const paths = [...seat.fs.keys()]
        .filter((p) => p.startsWith(seat.cwd))
        .map((p) => p.slice(seat.cwd.length).replace(/^\//, "") || ".")
        .filter(Boolean);
      stdout = ["total 0", ...paths.map((p) => `-rw-r--r-- 1 agent agent 0 ${p}`)].join(
        "\n",
      ) + "\n";
    } else if (cmd.startsWith("cat ")) {
      const path = this.resolve(seat.cwd, cmd.slice(4).trim());
      const content = seat.fs.get(path);
      if (content === undefined) {
        stderr = `cat: ${path}: No such file\n`;
        exitCode = 1;
      } else {
        stdout = content.endsWith("\n") ? content : content + "\n";
      }
    } else if (cmd.startsWith("echo ")) {
      stdout = cmd.slice(5) + "\n";
    } else {
      stderr = `memory backend: unsupported cmd (use e2b/daytona for real shell): ${cmd}\n`;
      exitCode = 127;
    }

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - start,
    };
  }

  async writeFile(id: ComputerId, file: FileWrite): Promise<void> {
    const seat = this.need(id);
    const path = this.resolve(seat.cwd, file.path);
    const content =
      typeof file.content === "string"
        ? file.content
        : new TextDecoder().decode(file.content);
    seat.fs.set(path, content);
  }

  async readFile(id: ComputerId, path: string): Promise<FileRead> {
    const seat = this.need(id);
    const full = this.resolve(seat.cwd, path);
    const content = seat.fs.get(full);
    if (content === undefined) {
      throw new Error(`ENOENT: ${full}`);
    }
    return { path: full, content };
  }

  private need(id: ComputerId) {
    const seat = this.seats.get(id);
    if (!seat) throw new Error(`unknown computer: ${id}`);
    return seat;
  }

  private resolve(cwd: string, path: string): string {
    if (path.startsWith("/")) return path;
    return `${cwd.replace(/\/$/, "")}/${path}`;
  }
}
