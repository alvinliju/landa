export type LandaPage =
  | "overview"
  | "sandboxes"
  | "sandbox"
  | "templates"
  | "guide"
  | "settings";

export const pagePaths: Record<Exclude<LandaPage, "sandbox">, string> = {
  overview: "/",
  sandboxes: "/sandboxes",
  templates: "/templates",
  guide: "/guide",
  settings: "/settings",
};

export const pageTitles: Record<LandaPage, string> = {
  overview: "Overview",
  sandboxes: "VMs",
  sandbox: "VM",
  templates: "Templates",
  guide: "Guide",
  settings: "Settings",
};

export function pageFromPath(pathname: string): {
  page: LandaPage;
  sandboxId?: string;
} {
  if (pathname.startsWith("/sandboxes/")) {
    const id = pathname.slice("/sandboxes/".length).split("/")[0];
    if (id) return { page: "sandbox", sandboxId: id };
  }
  if (pathname.startsWith("/sandboxes")) return { page: "sandboxes" };
  if (pathname.startsWith("/templates")) return { page: "templates" };
  if (pathname.startsWith("/guide")) return { page: "guide" };
  if (pathname.startsWith("/settings")) return { page: "settings" };
  return { page: "overview" };
}

export function sandboxPath(id: string) {
  return `/sandboxes/${id}`;
}

/** Public API base users should paste into agents / curl. */
export function publicApiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://landa.tharavad.xyz";
}
