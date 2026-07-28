export type LandaPage =
  | "overview"
  | "sandboxes"
  | "sandbox"
  | "templates"
  | "settings";

export const pagePaths: Record<Exclude<LandaPage, "sandbox">, string> = {
  overview: "/",
  sandboxes: "/sandboxes",
  templates: "/templates",
  settings: "/settings",
};

export const pageTitles: Record<LandaPage, string> = {
  overview: "Overview",
  sandboxes: "Sandboxes",
  sandbox: "Sandbox",
  templates: "Templates",
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
  if (pathname.startsWith("/settings")) return { page: "settings" };
  return { page: "overview" };
}

export function sandboxPath(id: string) {
  return `/sandboxes/${id}`;
}
