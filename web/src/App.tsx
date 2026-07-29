import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { api, setApiKey } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  pageFromPath,
  pagePaths,
  pageTitles,
  sandboxPath,
  type LandaPage,
} from "@/lib/navigation";
import type { Project } from "@/lib/types";
import { OverviewPage } from "@/pages/overview-page";
import { SandboxDetailPage } from "@/pages/sandbox-detail-page";
import { SandboxesPage } from "@/pages/sandboxes-page";
import { SettingsPage } from "@/pages/settings-page";
import { SignInPage } from "@/pages/sign-in-page";
import { TemplatesPage } from "@/pages/templates-page";

export default function App() {
  const [ready, setReady] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);
  const [project, setProject] = React.useState<Project | null>(null);
  const [backends, setBackends] = React.useState<string[]>([]);
  const [user, setUser] = React.useState<{
    id?: string;
    email?: string;
    name?: string;
  } | null>(null);
  const [route, setRoute] = React.useState(() =>
    pageFromPath(location.pathname),
  );

  const boot = React.useCallback(async () => {
    try {
      const me = await api.me();
      setProject(me.project);
      setBackends(me.backends ?? []);
      setUser(me.user ?? null);
      setAuthed(true);
    } catch {
      setAuthed(false);
      setProject(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  React.useEffect(() => {
    void boot();
  }, [boot]);

  React.useEffect(() => {
    const onPop = () => setRoute(pageFromPath(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(page: Exclude<LandaPage, "sandbox">) {
    history.pushState({}, "", pagePaths[page]);
    setRoute({ page });
  }

  function openSandbox(id: string) {
    history.pushState({}, "", sandboxPath(id));
    setRoute({ page: "sandbox", sandboxId: id });
  }

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      /* ignore */
    }
    setApiKey(null);
    setAuthed(false);
    setProject(null);
    setUser(null);
  }

  if (!ready) {
    return (
      <div className="surface-mesh flex min-h-svh flex-col items-center justify-center gap-3">
        <LoaderCircleIcon className="size-5 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading console…</p>
      </div>
    );
  }

  if (!authed || !project) {
    return (
      <SignInPage
        onAuthed={() => {
          setReady(false);
          void boot();
        }}
      />
    );
  }

  const userLabel = user?.email || user?.name || project.slug;

  return (
    <SidebarProvider>
      <AppSidebar
        page={route.page}
        navigate={navigate}
        projectSlug={project.slug}
        user={user ?? {}}
        onSignOut={() => void handleSignOut()}
      />
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium">
                  {pageTitles[route.page]}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <span className="hidden rounded-full bg-success/10 px-2 py-0.5 text-[0.65rem] font-medium text-success sm:inline-flex sm:items-center sm:gap-1.5">
              <span className="pulse-dot size-1.5 rounded-full bg-success" />
              Live
            </span>
            <span className="max-w-[12rem] truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-[0.65rem] text-muted-foreground ring-1 ring-border/50 sm:max-w-xs">
              {userLabel}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          {route.page === "overview" ? (
            <OverviewPage
              project={project}
              backends={backends}
              onCreate={() => navigate("sandboxes")}
              onOpenSandbox={openSandbox}
            />
          ) : null}
          {route.page === "sandboxes" ? (
            <SandboxesPage onOpen={openSandbox} />
          ) : null}
          {route.page === "sandbox" && route.sandboxId ? (
            <SandboxDetailPage
              id={route.sandboxId}
              onBack={() => navigate("sandboxes")}
              onDestroyed={() => navigate("sandboxes")}
            />
          ) : null}
          {route.page === "templates" ? <TemplatesPage /> : null}
          {route.page === "settings" ? (
            <SettingsPage onSignOut={() => void handleSignOut()} />
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
