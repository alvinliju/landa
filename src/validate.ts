/**
 * Shared request validation for landa HTTP API.
 * Prefer early 400s with stable error codes.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** API key / VM labels: short, printable, no control chars */
const LABEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._@/+\- ]{0,62}[a-zA-Z0-9]?$/;

export type ValErr = { error: string; message: string; field?: string };

export function okUuid(id: string | undefined, field = "id"): ValErr | null {
  if (!id || typeof id !== "string" || !UUID_RE.test(id.trim())) {
    return {
      error: "invalid_id",
      message: `${field} must be a UUID`,
      field,
    };
  }
  return null;
}

/**
 * Normalize + validate a human label (API keys, VM labels).
 * emptyOk: allow "" (optional VM labels).
 */
export function parseLabel(
  raw: unknown,
  opts: {
    field?: string;
    emptyOk?: boolean;
    defaultValue?: string;
    max?: number;
  } = {},
): { label: string } | ValErr {
  const field = opts.field ?? "label";
  const max = opts.max ?? 64;
  if (raw === undefined || raw === null) {
    if (opts.defaultValue !== undefined) return { label: opts.defaultValue };
    if (opts.emptyOk) return { label: "" };
    return {
      error: "invalid_label",
      message: `${field} is required`,
      field,
    };
  }
  if (typeof raw !== "string") {
    return {
      error: "invalid_label",
      message: `${field} must be a string`,
      field,
    };
  }
  const label = raw.trim().replace(/\s+/g, " ").slice(0, max);
  if (!label) {
    if (opts.emptyOk) return { label: "" };
    if (opts.defaultValue !== undefined) return { label: opts.defaultValue };
    return {
      error: "invalid_label",
      message: `${field} cannot be empty`,
      field,
    };
  }
  if (label.length < 1 || label.length > max) {
    return {
      error: "invalid_label",
      message: `${field} must be 1–${max} characters`,
      field,
    };
  }
  if (!LABEL_RE.test(label)) {
    return {
      error: "invalid_label",
      message: `${field} may only use letters, numbers, spaces, and . _ - @ / +`,
      field,
    };
  }
  return { label };
}

export function parseTemplate(raw: unknown): { template: string } | ValErr {
  if (raw === undefined || raw === null || raw === "") {
    return { template: "landa-agent" };
  }
  if (typeof raw !== "string") {
    return {
      error: "invalid_template",
      message: "template must be a string",
      field: "template",
    };
  }
  const template = raw.trim();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(template)) {
    return {
      error: "invalid_template",
      message: "template slug is invalid",
      field: "template",
    };
  }
  return { template };
}

export function parseTtlSec(
  raw: unknown,
  maxSessionSec: number,
): { ttlSec: number } | ValErr {
  if (raw === undefined || raw === null) {
    return { ttlSec: maxSessionSec };
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return {
      error: "invalid_ttl",
      message: "ttlSec must be a positive number",
      field: "ttlSec",
    };
  }
  const n = Math.floor(raw);
  if (n < 60) {
    return {
      error: "invalid_ttl",
      message: "ttlSec must be at least 60 seconds",
      field: "ttlSec",
    };
  }
  return { ttlSec: Math.min(n, maxSessionSec) };
}

export function parseCmd(raw: unknown): { cmd: string } | ValErr {
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      error: "invalid_cmd",
      message: "cmd is required (non-empty string)",
      field: "cmd",
    };
  }
  const cmd = raw.trim();
  if (cmd.length > 32_768) {
    return {
      error: "invalid_cmd",
      message: "cmd too long (max 32KB)",
      field: "cmd",
    };
  }
  return { cmd };
}

export type FilePathRoots = "work" | "workspace";

/**
 * Validate a guest file path.
 * - sandboxes: absolute under /work (default)
 * - sessions: absolute under /workspace (pass roots: ["workspace"])
 * Relative paths ok (backend may resolve under /root).
 */
export function parseFilePath(
  raw: unknown,
  opts?: { roots?: FilePathRoots[] },
): { path: string } | ValErr {
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      error: "invalid_path",
      message: "path is required",
      field: "path",
    };
  }
  const path = raw.trim();
  if (path.length > 1024) {
    return {
      error: "invalid_path",
      message: "path too long",
      field: "path",
    };
  }
  if (path.includes("\0")) {
    return {
      error: "invalid_path",
      message: "path contains null byte",
      field: "path",
    };
  }
  if (path.includes("..")) {
    return {
      error: "invalid_path",
      message: "path must not contain ..",
      field: "path",
    };
  }
  const roots = opts?.roots ?? (["work"] as FilePathRoots[]);
  const allowedPrefixes = roots.map((r) =>
    r === "workspace" ? "/workspace" : "/work",
  );
  if (path.startsWith("/")) {
    const ok = allowedPrefixes.some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
    if (!ok) {
      return {
        error: "invalid_path",
        message: `absolute paths must be under ${allowedPrefixes.join(" or ")}`,
        field: "path",
      };
    }
  }
  return { path };
}

export function parseFileContent(raw: unknown): { content: string } | ValErr {
  if (typeof raw !== "string") {
    return {
      error: "invalid_content",
      message: "content must be a string",
      field: "content",
    };
  }
  // ~1 MiB soft cap for control-plane writes
  if (raw.length > 1_048_576) {
    return {
      error: "invalid_content",
      message: "content too large (max 1 MiB)",
      field: "content",
    };
  }
  return { content: raw };
}

/** True if parse* returned a validation error (not a success payload). */
export function isErr(v: object): v is ValErr {
  return "error" in v && typeof (v as ValErr).error === "string";
}
