import type { BackendCapabilities, BackendName, ComputerBackend } from "../types.js";
import { BackendNotFoundError } from "../errors.js";

/**
 * Named bag of seat drivers. ControlPlane routes create() by spec.backend.
 */
export class BackendRegistry {
  private readonly backends = new Map<string, ComputerBackend>();
  private defaultName: string | null = null;

  register(backend: ComputerBackend, opts?: { default?: boolean }): this {
    this.backends.set(backend.name, backend);
    if (opts?.default || this.defaultName === null) {
      this.defaultName = backend.name;
    }
    return this;
  }

  has(name: string): boolean {
    return this.backends.has(name);
  }

  get(name: BackendName | string): ComputerBackend {
    const b = this.backends.get(name);
    if (!b) throw new BackendNotFoundError(name);
    return b;
  }

  tryGet(name: string): ComputerBackend | null {
    return this.backends.get(name) ?? null;
  }

  default(): ComputerBackend {
    if (!this.defaultName) {
      throw new BackendNotFoundError("(none registered)");
    }
    return this.get(this.defaultName);
  }

  list(): ComputerBackend[] {
    return [...this.backends.values()];
  }

  names(): string[] {
    return [...this.backends.keys()];
  }
}

/** default capability table — backends can override via their own docs */
export const BACKEND_CAPABILITIES: Record<string, BackendCapabilities> = {
  memory: {
    name: "memory",
    isolation: "none",
    exec: true,
    files: true,
    pause: true,
    checkpoint: false,
    notes: "in-process fake seat — control plane + contract tests",
  },
  docker: {
    name: "docker",
    isolation: "container",
    exec: true,
    files: true,
    pause: true,
    checkpoint: false,
    notes: "real shell/fs via docker run/exec/cp",
  },
  firecracker: {
    name: "firecracker",
    isolation: "microvm",
    exec: false,
    files: false,
    pause: false,
    checkpoint: true,
    notes: "spike only — not wired to create yet",
  },
};

/** build the usual local set: memory always; docker if requested */
export function createDefaultRegistry(opts?: {
  includeDocker?: boolean;
  defaultBackend?: BackendName;
}): BackendRegistry {
  // lazy imports avoided — callers register what they need
  void opts;
  return new BackendRegistry();
}
