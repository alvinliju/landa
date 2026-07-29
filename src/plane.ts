/**
 * Shared ControlPlane factory — CLI, API, demos use the same wiring.
 */
import { ControlPlane } from "./control-plane.js";
import { BackendRegistry } from "./backends/registry.js";
import { MemoryBackend } from "./backends/memory.js";
import {
  FirecrackerBackend,
  firecrackerAvailable,
} from "./backends/firecracker.js";

export type PlaneOptions = {
  /** force-include firecracker even if probe fails */
  firecracker?: boolean | "auto";
  /** default backend when spec.backend omitted */
  defaultBackend?: "memory" | "firecracker";
  firecrackerOpts?: ConstructorParameters<typeof FirecrackerBackend>[0];
};

export async function createPlane(
  opts: PlaneOptions = {},
): Promise<ControlPlane> {
  const registry = new BackendRegistry();
  const wantFcDefault =
    opts.defaultBackend === "firecracker" ||
    process.env.LANDA_BACKEND === "firecracker";

  registry.register(new MemoryBackend(), { default: !wantFcDefault });

  const wantFc =
    opts.firecracker === true ||
    opts.firecracker === "auto" ||
    wantFcDefault ||
    process.env.LANDA_FIRECRACKER === "1" ||
    process.env.LANDA_FIRECRACKER === "auto";

  if (wantFc) {
    const ok =
      opts.firecracker === true ? true : await firecrackerAvailable();
    if (ok) {
      // resolve firecracker binary if only on PATH from nix develop
      let bin = process.env.FIRECRACKER_BIN;
      if (!bin) {
        try {
          const { execSync } = await import("node:child_process");
          bin = execSync("command -v firecracker", { encoding: "utf8" }).trim();
        } catch {
          bin = "firecracker";
        }
      }
      registry.register(
        new FirecrackerBackend({
          ...opts.firecrackerOpts,
          firecrackerBin: bin,
        }),
        { default: wantFcDefault },
      );
    } else if (opts.firecracker === true || wantFcDefault) {
      console.warn(
        "[landa] firecracker requested but /dev/kvm or binary missing",
      );
    }
  }

  return new ControlPlane(registry);
}

/** sync plane — memory only (tests, no I/O) */
export function createMemoryPlane(): ControlPlane {
  return new ControlPlane(new MemoryBackend());
}
