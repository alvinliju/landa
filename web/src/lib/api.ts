import type {
  ExecResult,
  Health,
  Project,
  Sandbox,
  Template,
  WorldSnapshot,
} from "./types";

const STORAGE_KEY = "landa.apiKey";
const BASE_KEY = "landa.apiBase";

/**
 * empty = same origin (prod: landa.tharavad.xyz proxies /v1 + /api)
 * Cross-origin bases break session cookies — refuse them in the browser console.
 */
export function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(BASE_KEY);
  if (stored !== null && stored !== "") {
    const base = stored.replace(/\/$/, "");
    // same-origin only for cookie sessions
    try {
      if (new URL(base, window.location.origin).origin === window.location.origin) {
        return base;
      }
      // stale cross-origin override (e.g. landa-back) — drop it
      localStorage.removeItem(BASE_KEY);
    } catch {
      localStorage.removeItem(BASE_KEY);
    }
  }
  // never use VITE_LANDA_API_URL when it would cross origin (cookies won't attach)
  const envUrl = import.meta.env.VITE_LANDA_API_URL?.replace(/\/$/, "");
  if (envUrl) {
    try {
      if (new URL(envUrl, window.location.origin).origin === window.location.origin) {
        return envUrl;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function setApiBase(base: string) {
  localStorage.setItem(BASE_KEY, base.replace(/\/$/, ""));
}

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string | null) {
  if (!key) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, key.trim());
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const base = getApiBase();
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const key = getApiKey();
    if (key) headers.set("Authorization", `Bearer ${key}`);
  }

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: "include", // Better Auth session cookie
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : typeof data === "object" &&
            data &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : res.statusText;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export type MeResponse = {
  project: Project;
  backends: string[];
  via?: "session" | "api_key";
  user?: { id: string; email?: string; name?: string } | null;
  vms?: { active: number; maxConcurrent: number };
};

/** Load /v1/me with short retries (cookies can lag a tick after sign-in). */
export async function loadMe(retries = 5): Promise<MeResponse> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await api.me();
    } catch (e) {
      last = e;
      // only retry unauthorized / network blips
      const status = e instanceof ApiError ? e.status : 0;
      if (status && status !== 401 && status !== 403 && status < 500) throw e;
      await new Promise((r) => setTimeout(r, 80 + i * 120));
    }
  }
  throw last instanceof Error
    ? last
    : new Error("Could not load your session");
}

export const api = {
  health: () => request<Health>("/health", {}, false),
  me: () => request<MeResponse>("/v1/me"),
  backends: () => request<{ backends: string[] }>("/v1/backends"),
  templates: () => request<{ templates: Template[] }>("/v1/templates"),
  sandboxes: () => request<{ sandboxes: Sandbox[] }>("/v1/sandboxes"),
  vms: () => request<{ vms: import("./types").Vm[] }>("/v1/vms"),
  sandbox: (id: string) =>
    request<{ sandbox: Sandbox }>(`/v1/sandboxes/${id}`),
  createSandbox: (body: {
    template?: string;
    label?: string;
    ttlSec?: number;
  }) =>
    request<{
      sandbox: Sandbox;
      vm?: { id: string; user_id: string; sandbox_id: string };
    }>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  destroySandbox: (id: string) =>
    request<{ sandbox: { id: string; status: string } }>(
      `/v1/sandboxes/${id}`,
      { method: "DELETE" },
    ),
  exec: (id: string, cmd: string) =>
    request<{ result: ExecResult }>(`/v1/sandboxes/${id}/exec`, {
      method: "POST",
      body: JSON.stringify({ cmd }),
    }),
  snapshot: (id: string) =>
    request<{ snapshot: WorldSnapshot }>(`/v1/sandboxes/${id}/snapshot`, {
      method: "POST",
    }),
  writeFile: (id: string, path: string, content: string) =>
    request<{ ok: boolean }>(`/v1/sandboxes/${id}/files`, {
      method: "POST",
      body: JSON.stringify({ path, content }),
    }),
  readFile: (id: string, path: string) =>
    request<{ file: { path: string; content: string } }>(
      `/v1/sandboxes/${id}/files?path=${encodeURIComponent(path)}&mode=read`,
    ),
};
