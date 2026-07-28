import type {
  BackendName,
  ComputerBackend,
  ComputerId,
  ComputerInfo,
  ComputerSpec,
  ExecRequest,
  ExecResult,
  FileEntry,
  FileRead,
  FileWrite,
  WorldSnapshot,
} from "./types.js";
import {
  ComputerNotFoundError,
  UnsupportedError,
  isLandaError,
} from "./errors.js";
import { BackendRegistry } from "./backends/registry.js";
import { snapshotShell } from "./world/snapshot.js";

/**
 * Control plane — one API over many backends.
 * Agents / MCP / HTTP talk here; never import a vendor SDK into agent paths.
 */
export class ControlPlane {
  private readonly registry: BackendRegistry;
  /** id → backend name for multi-backend routing */
  private readonly owner = new Map<ComputerId, BackendName>();

  constructor(backendOrRegistry: ComputerBackend | BackendRegistry) {
    if (backendOrRegistry instanceof BackendRegistry) {
      this.registry = backendOrRegistry;
    } else {
      this.registry = new BackendRegistry().register(backendOrRegistry, {
        default: true,
      });
    }
  }

  get backendName(): string {
    return this.registry.default().name;
  }

  backends(): string[] {
    return this.registry.names();
  }

  async create(spec: ComputerSpec = {}): Promise<ComputerInfo> {
    const backend = this.resolveCreateBackend(spec);
    const info = await backend.create({
      ...spec,
      backend: backend.name,
    });
    this.owner.set(info.id, backend.name);
    return info;
  }

  async get(id: ComputerId): Promise<ComputerInfo | null> {
    const b = await this.backendFor(id, false);
    if (!b) return null;
    return b.get(id);
  }

  async list(): Promise<ComputerInfo[]> {
    const all: ComputerInfo[] = [];
    for (const b of this.registry.list()) {
      all.push(...(await b.list()));
    }
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async destroy(id: ComputerId): Promise<void> {
    const b = await this.backendFor(id, true);
    await b.destroy(id);
    this.owner.delete(id);
  }

  async exec(id: ComputerId, req: ExecRequest): Promise<ExecResult> {
    const b = await this.backendFor(id, true);
    return b.exec(id, req);
  }

  async writeFile(id: ComputerId, file: FileWrite): Promise<void> {
    const b = await this.backendFor(id, true);
    return b.writeFile(id, file);
  }

  async readFile(id: ComputerId, path: string): Promise<FileRead> {
    const b = await this.backendFor(id, true);
    return b.readFile(id, path);
  }

  async listFiles(id: ComputerId, path?: string): Promise<FileEntry[]> {
    const b = await this.backendFor(id, true);
    if (!b.listFiles) throw new UnsupportedError("listFiles", b.name);
    return b.listFiles(id, path);
  }

  async pause(id: ComputerId): Promise<void> {
    const b = await this.backendFor(id, true);
    if (!b.pause) throw new UnsupportedError("pause", b.name);
    return b.pause(id);
  }

  async resume(id: ComputerId): Promise<void> {
    const b = await this.backendFor(id, true);
    if (!b.resume) throw new UnsupportedError("resume", b.name);
    return b.resume(id);
  }

  /** seat checkpoint (VM snapshot / docker commit) — not world JSON */
  async checkpoint(id: ComputerId, label?: string): Promise<string> {
    const b = await this.backendFor(id, true);
    if (!b.checkpoint) throw new UnsupportedError("checkpoint", b.name);
    return b.checkpoint(id, label);
  }

  /** agent-facing world model (shell sensors → compact JSON) */
  async worldSnapshot(id: ComputerId): Promise<WorldSnapshot> {
    const b = await this.backendFor(id, true);
    return snapshotShell(b, id);
  }

  /** @deprecated use worldSnapshot — kept for existing callers */
  snapshot(id: ComputerId): Promise<WorldSnapshot> {
    return this.worldSnapshot(id);
  }

  /** create → fn → destroy (best-effort cleanup) */
  async withComputer<T>(
    spec: ComputerSpec,
    fn: (id: ComputerId, plane: ControlPlane) => Promise<T>,
  ): Promise<T> {
    const info = await this.create(spec);
    try {
      return await fn(info.id, this);
    } finally {
      await this.destroy(info.id).catch(() => undefined);
    }
  }

  private resolveCreateBackend(spec: ComputerSpec): ComputerBackend {
    if (spec.backend) {
      return this.registry.get(spec.backend);
    }
    return this.registry.default();
  }

  private async backendFor(
    id: ComputerId,
    required: true,
  ): Promise<ComputerBackend>;
  private async backendFor(
    id: ComputerId,
    required: false,
  ): Promise<ComputerBackend | null>;
  private async backendFor(
    id: ComputerId,
    required: boolean,
  ): Promise<ComputerBackend | null> {
    const known = this.owner.get(id);
    if (known) {
      return this.registry.get(known);
    }
    // recover after process restart: probe all backends
    for (const b of this.registry.list()) {
      const info = await b.get(id);
      if (info) {
        this.owner.set(id, b.name);
        return b;
      }
    }
    // id prefix hints
    if (id.startsWith("mem_") && this.registry.has("memory")) {
      if (required) throw new ComputerNotFoundError(id);
      return null;
    }
    if (id.startsWith("dck_") && this.registry.has("docker")) {
      if (required) throw new ComputerNotFoundError(id);
      return null;
    }
    if (required) throw new ComputerNotFoundError(id);
    return null;
  }
}

export function landaErrorToHttp(e: unknown): {
  status: number;
  body: Record<string, unknown>;
} {
  if (isLandaError(e)) {
    return {
      status: e.status,
      body: { error: e.code, message: e.message, ...e.details },
    };
  }
  return {
    status: 500,
    body: { error: "internal", message: String(e) },
  };
}
