export type LandaPage =
  | "overview"
  | "sessions"
  | "session"
  | "sandboxes"
  | "sandbox"
  | "templates"
  | "guide"
  | "api-keys"
  | "settings";

export const pagePaths: Record<
  Exclude<LandaPage, "sandbox" | "session">,
  string
> = {
  overview: "/",
  sessions: "/sessions",
  sandboxes: "/sandboxes",
  templates: "/templates",
  guide: "/guide",
  "api-keys": "/api-keys",
  settings: "/settings",
};

export const pageTitles: Record<LandaPage, string> = {
  overview: "Overview",
  sessions: "Sessions",
  session: "Session",
  sandboxes: "VMs",
  sandbox: "VM",
  templates: "Templates",
  guide: "Guide",
  "api-keys": "API keys",
  settings: "Settings",
};

export function pageFromPath(pathname: string): {
  page: LandaPage;
  sandboxId?: string;
  sessionId?: string;
} {
  if (pathname.startsWith("/sandboxes/")) {
    const id = pathname.slice("/sandboxes/".length).split("/")[0];
    if (id) return { page: "sandbox", sandboxId: id };
  }
  if (pathname.startsWith("/sandboxes")) return { page: "sandboxes" };
  if (pathname.startsWith("/sessions/")) {
    const id = pathname.slice("/sessions/".length).split("/")[0];
    if (id) return { page: "session", sessionId: id };
  }
  if (pathname.startsWith("/sessions")) return { page: "sessions" };
  if (pathname.startsWith("/templates")) return { page: "templates" };
  if (pathname.startsWith("/guide")) return { page: "guide" };
  if (pathname.startsWith("/api-keys")) return { page: "api-keys" };
  if (pathname.startsWith("/settings")) return { page: "settings" };
  return { page: "overview" };
}

export function sandboxPath(id: string) {
  return `/sandboxes/${id}`;
}

export function sessionPath(id: string) {
  return `/sessions/${id}`;
}

/** Public API base users should paste into agents / curl. */
export function publicApiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://landa.tharavad.xyz";
}
