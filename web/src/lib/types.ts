export type SandboxStatus =
  | "creating"
  | "running"
  | "paused"
  | "stopped"
  | "destroyed"
  | "error";

export interface Project {
  id: string;
  slug: string;
  maxConcurrent: number;
  maxSessionSec: number;
}

export interface Template {
  id: string;
  slug: string;
  name: string;
  backend: string;
  config: Record<string, unknown>;
  created_at: string;
}

export interface Sandbox {
  id: string;
  label: string;
  status: SandboxStatus;
  backend: string;
  guest_ip: string | null;
  metadata: {
    computerId?: string;
    endpoints?: Record<string, string>;
    seatStatus?: string;
    note?: string;
  };
  created_at: string;
  started_at: string | null;
  expires_at: string | null;
  error: string | null;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface WorldSnapshot {
  computerId: string;
  at: string;
  surface: string;
  summary: string[];
  affordances: {
    id: string;
    kind: string;
    name: string;
    actions: string[];
    meta?: Record<string, unknown>;
  }[];
  sensors?: { cwd?: string };
}

export interface Health {
  ok: boolean;
  service: string;
  db: boolean;
  backends?: string[];
}
