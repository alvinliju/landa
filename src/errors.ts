import type { ComputerId, ComputerStatus } from "./types.js";

/** base error — safe to map to HTTP */
export class LandaError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LandaError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ComputerNotFoundError extends LandaError {
  constructor(id: ComputerId) {
    super("computer_not_found", `unknown computer: ${id}`, 404, { id });
    this.name = "ComputerNotFoundError";
  }
}

export class ComputerNotRunningError extends LandaError {
  constructor(id: ComputerId, status: ComputerStatus) {
    super(
      "computer_not_running",
      `computer ${id} is ${status}, expected running`,
      409,
      { id, status },
    );
    this.name = "ComputerNotRunningError";
  }
}

export class UnsupportedError extends LandaError {
  constructor(feature: string, backend?: string) {
    super(
      "unsupported",
      backend
        ? `${feature} not supported on backend ${backend}`
        : `${feature} not supported`,
      501,
      { feature, backend },
    );
    this.name = "UnsupportedError";
  }
}

export class BackendNotFoundError extends LandaError {
  constructor(name: string) {
    super("backend_not_found", `unknown backend: ${name}`, 400, { name });
    this.name = "BackendNotFoundError";
  }
}

export class BackendError extends LandaError {
  constructor(backend: string, message: string, details?: Record<string, unknown>) {
    super("backend_error", message, 500, { backend, ...details });
    this.name = "BackendError";
  }
}

export class FileNotFoundError extends LandaError {
  constructor(path: string) {
    super("file_not_found", `ENOENT: ${path}`, 404, { path });
    this.name = "FileNotFoundError";
  }
}

export function isLandaError(e: unknown): e is LandaError {
  return e instanceof LandaError;
}
