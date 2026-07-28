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
import { api, getApiKey } from "@/lib/api";
import {
  pageFromPath,
  pagePaths,
  pageTitles,
  sandboxPath,
  type LandaPage,
} from "@/lib/navigation";
import type { Project } from "@/lib/types";
import { ConnectPage } from "@/pages/connect-page";
import { OverviewPage } from "@/pages/overview-page";
import { SandboxDetailPage } from "@/pages/sandbox-detail-page";
import { SandboxesPage } from "@/pages/sandboxes-page";
import { SettingsPage } from "@/pages/settings-page";
import { TemplatesPage } from "@/pages/templates-page";

export default function App() {
  const [ready, setReady] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);
  const [project, setProject] = React.useState<Project | null>(null);
  const [backends, setBackends] = React.useState<string[]>([]);
  const [route, setRoute] = React.useState(() =>
    pageFromPath(location.pathname),
  );

  const boot = React.useCallback(async () => {
    if (!getApiKey()) {
      setAuthed(false);
      setReady(true);
      return;
    }
    try {
      const me = await api.me();
      setProject(me.project);
      setBackends(me.backends ?? []);
      setAuthed(true);
    } catch {
      setAuthed(false);
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

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed || !project) {
    return (
      <ConnectPage
        onConnected={() => {
          setReady(false);
          void boot();
        }}
      />
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar
        page={route.page}
        navigate={navigate}
        projectSlug={project.slug}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitles[route.page]}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
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
            <SettingsPage
              onSignOut={() => {
                setAuthed(false);
                setProject(null);
              }}
            />
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
