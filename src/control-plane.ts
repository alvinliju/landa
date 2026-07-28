import type {
  ComputerBackend,
  ComputerId,
  ComputerInfo,
  ComputerSpec,
  ExecRequest,
  ExecResult,
  FileRead,
  FileWrite,
  WorldSnapshot,
} from "./types.js";
import { snapshotShell } from "./world/snapshot.js";

/**
 * Control plane — one API over many backends.
 * This is the product surface agents and MCP skills talk to.
 */
export class ControlPlane {
  constructor(private readonly backend: ComputerBackend) {}

  get backendName(): string {
    return this.backend.name;
  }

  create(spec: ComputerSpec = {}): Promise<ComputerInfo> {
    return this.backend.create(spec);
  }

  get(id: ComputerId): Promise<ComputerInfo | null> {
    return this.backend.get(id);
  }

  list(): Promise<ComputerInfo[]> {
    return this.backend.list();
  }

  destroy(id: ComputerId): Promise<void> {
    return this.backend.destroy(id);
  }

  exec(id: ComputerId, req: ExecRequest): Promise<ExecResult> {
    return this.backend.exec(id, req);
  }

  writeFile(id: ComputerId, file: FileWrite): Promise<void> {
    return this.backend.writeFile(id, file);
  }

  readFile(id: ComputerId, path: string): Promise<FileRead> {
    return this.backend.readFile(id, path);
  }

  snapshot(id: ComputerId): Promise<WorldSnapshot> {
    return snapshotShell(this.backend, id);
  }

  /** convenience: create → fn → destroy (best-effort) */
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
}
