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
  const who = await backend.exec(id, { cmd: "whoami; uname -a", timeoutMs: 5_000 });
  const ls = await backend.exec(id, {
    cmd: "ls -la 2>/dev/null | head -30",
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
      ...who.stdout.trim().split("\n").filter(Boolean).slice(0, 2),
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
