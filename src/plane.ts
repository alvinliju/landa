/**
 * Shared ControlPlane factory — CLI, API, demos use the same wiring.
 */
import { ControlPlane } from "./control-plane.js";
import { BackendRegistry } from "./backends/registry.js";
import { MemoryBackend } from "./backends/memory.js";
import { DockerBackend, dockerAvailable } from "./backends/docker.js";

export type PlaneOptions = {
  /** force-include docker even if probe fails */
  docker?: boolean | "auto";
  /** default image for docker seats */
  dockerImage?: string;
  /** default backend name when spec.backend omitted */
  defaultBackend?: "memory" | "docker";
};

export async function createPlane(opts: PlaneOptions = {}): Promise<ControlPlane> {
  const registry = new BackendRegistry();
  const memory = new MemoryBackend();
  registry.register(memory, { default: opts.defaultBackend !== "docker" });

  const wantDocker =
    opts.docker === true ||
    opts.docker === "auto" ||
    opts.defaultBackend === "docker" ||
    process.env.LANDA_DOCKER === "1" ||
    process.env.LANDA_BACKEND === "docker";

  if (wantDocker) {
    const ok = opts.docker === true ? true : await dockerAvailable();
    if (ok) {
      registry.register(new DockerBackend({ image: opts.dockerImage }), {
        default: opts.defaultBackend === "docker",
      });
    } else if (opts.docker === true || opts.defaultBackend === "docker") {
      console.warn("[landa] docker requested but docker is not available");
    }
  }

  return new ControlPlane(registry);
}

/** sync plane — memory only (tests, no I/O) */
export function createMemoryPlane(): ControlPlane {
  return new ControlPlane(new MemoryBackend());
}
