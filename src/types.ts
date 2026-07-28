/**
 * Seat contract — the unit of work is a Computer, not a chat message.
 * Backends (memory, e2b, daytona, fly, mothership microvm) implement this.
 */

export type ComputerId = string;

export type ComputerStatus =
  | "creating"
  | "running"
  | "paused"
  | "stopped"
  | "destroyed"
  | "error";

export interface ComputerSpec {
  /** human label */
  name?: string;
  /** template / image id (backend-specific) */
  template?: string;
  /** soft caps — backends may ignore until real isolation exists */
  vcpu?: number;
  memoryMiB?: number;
  timeoutSec?: number;
  /** free-form tags for control plane */
  labels?: Record<string, string>;
  env?: Record<string, string>;
}

export interface ComputerInfo {
  id: ComputerId;
  status: ComputerStatus;
  createdAt: string;
  backend: string;
  spec: ComputerSpec;
  /** backend-specific endpoint hints (ssh, cdp, mcp) */
  endpoints?: {
    ssh?: string;
    cdp?: string;
    mcp?: string;
  };
}

export interface ExecRequest {
  cmd: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface FileWrite {
  path: string;
  content: string | Uint8Array;
}

export interface FileRead {
  path: string;
  content: string;
}

/** compressed world model — agent-native, not a raw dump */
export interface WorldSnapshot {
  computerId: ComputerId;
  at: string;
  surface: "shell" | "browser" | "mixed";
  /** short status lines, not full trees */
  summary: string[];
  affordances: Affordance[];
  /** optional structured sensors */
  sensors?: {
    cwd?: string;
    processes?: { pid: number; cmd: string }[];
    ports?: number[];
  };
}

export interface Affordance {
  id: string;
  kind: "shell" | "file" | "ui" | "http";
  name: string;
  /** what the agent can do */
  actions: string[];
  meta?: Record<string, unknown>;
}

/**
 * Backend driver — swap cloud providers without rewriting the agent.
 */
export interface ComputerBackend {
  readonly name: string;
  create(spec: ComputerSpec): Promise<ComputerInfo>;
  get(id: ComputerId): Promise<ComputerInfo | null>;
  list(): Promise<ComputerInfo[]>;
  destroy(id: ComputerId): Promise<void>;
  exec(id: ComputerId, req: ExecRequest): Promise<ExecResult>;
  writeFile(id: ComputerId, file: FileWrite): Promise<void>;
  readFile(id: ComputerId, path: string): Promise<FileRead>;
  /** optional lifecycle */
  pause?(id: ComputerId): Promise<void>;
  resume?(id: ComputerId): Promise<void>;
  snapshot?(id: ComputerId, label?: string): Promise<string>;
}
