import type { ComputerBackend, ComputerId, WorldSnapshot } from "../types.js";

/**
 * Build a compact world snapshot from shell sensors.
 * Real browsers / a11y / LumOS telemetry plug in later as extra sensors.
 */
export async function snapshotShell(
  backend: ComputerBackend,
  id: ComputerId,
): Promise<WorldSnapshot> {
  const cwd = await backend.exec(id, { cmd: "pwd", timeoutMs: 5_000 });
  // keep commands simple so memory + docker both work without a full shell
  const who = await backend.exec(id, { cmd: "whoami", timeoutMs: 5_000 });
  const uname = await backend.exec(id, { cmd: "uname -a", timeoutMs: 5_000 });
  const ls = await backend.exec(id, {
    cmd: "ls -la",
    timeoutMs: 5_000,
  });

  const cwdPath = cwd.stdout.trim() || "/";
  const lines = ls.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);

  return {
    computerId: id,
    at: new Date().toISOString(),
    surface: "shell",
    summary: [
      `cwd=${cwdPath}`,
      ...who.stdout.trim().split("\n").filter(Boolean).slice(0, 1),
      ...uname.stdout.trim().split("\n").filter(Boolean).slice(0, 1),
      `entries=${lines.length}`,
    ],
    affordances: [
      {
        id: "shell.default",
        kind: "shell",
        name: "default shell",
        actions: ["exec"],
      },
      {
        id: "fs.cwd",
        kind: "file",
        name: cwdPath,
        actions: ["read", "write", "list"],
        meta: { listing: lines },
      },
    ],
    sensors: {
      cwd: cwdPath,
    },
  };
}
