/**
 * Seat contract — the unit of work is a Computer, not a chat message.
 *
 * Agents, MCP, CLI, and the HTTP control plane all talk through
 * `ComputerBackend`. Swap isolation (memory → docker → microvm) without
 * rewriting callers.
 */

export type ComputerId = string;

export type ComputerStatus =
  | "creating"
  | "running"
  | "paused"
  | "stopped"
  | "destroyed"
  | "error";

/** known backend names — open string so custom drivers stay possible */
export type BackendName = "memory" | "docker" | "firecracker" | "microvm" | "cloudvm" | (string & {});

export interface ComputerSpec {
  /** human label */
  name?: string;
  /** which driver creates the seat (default: registry default) */
  backend?: BackendName;
  /** template / image id (backend-specific) */
  template?: string;
  /** docker image, firecracker rootfs, etc. */
  image?: string;
  /** soft caps — backends may ignore until real isolation exists */
  vcpu?: number;
  memoryMiB?: number;
  timeoutSec?: number;
  /** free-form tags for control plane */
  labels?: Record<string, string>;
  env?: Record<string, string>;
  /** working directory inside the seat */
  workdir?: string;
}

export interface ComputerInfo {
  id: ComputerId;
  status: ComputerStatus;
  createdAt: string;
  /** ISO time when status last changed (optional) */
  updatedAt?: string;
  backend: BackendName;
  spec: ComputerSpec;
  error?: string;
  /** backend-specific endpoint hints (ssh, cdp, mcp) */
  endpoints?: {
    ssh?: string;
    cdp?: string;
    mcp?: string;
    /** docker container name / id */
    container?: string;
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
  /** create parent dirs if missing (backends that support it) */
  mkdir?: boolean;
}

export interface FileRead {
  path: string;
  content: string;
}

export interface FileEntry {
  path: string;
  /** file | directory | other */
  kind: "file" | "directory" | "other";
  size?: number;
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
 * Backend driver — isolation boundary.
 *
 * Required: lifecycle + shell + files.
 * Optional: pause/resume, VM checkpoint (not the same as world JSON).
 */
export interface ComputerBackend {
  readonly name: BackendName;

  create(spec: ComputerSpec): Promise<ComputerInfo>;
  get(id: ComputerId): Promise<ComputerInfo | null>;
  list(): Promise<ComputerInfo[]>;
  destroy(id: ComputerId): Promise<void>;

  exec(id: ComputerId, req: ExecRequest): Promise<ExecResult>;
  writeFile(id: ComputerId, file: FileWrite): Promise<void>;
  readFile(id: ComputerId, path: string): Promise<FileRead>;

  /** optional directory listing under path (default ".") */
  listFiles?(id: ComputerId, path?: string): Promise<FileEntry[]>;

  /** optional lifecycle */
  pause?(id: ComputerId): Promise<void>;
  resume?(id: ComputerId): Promise<void>;

  /**
   * Optional *seat* checkpoint (Firecracker snapshot, docker commit, …).
   * Returns checkpoint id — not the world JSON (use ControlPlane.worldSnapshot).
   */
  checkpoint?(id: ComputerId, label?: string): Promise<string>;
}

/** capabilities a backend advertises (for UI / MCP) */
export interface BackendCapabilities {
  name: BackendName;
  isolation: "none" | "process" | "container" | "microvm" | "vm";
  exec: boolean;
  files: boolean;
  pause: boolean;
  checkpoint: boolean;
  notes?: string;
}
