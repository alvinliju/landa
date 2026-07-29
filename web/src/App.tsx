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
  const [userLabel, setUserLabel] = React.useState<string>("");
  const [route, setRoute] = React.useState(() =>
    pageFromPath(location.pathname),
  );

  const boot = React.useCallback(async () => {
    try {
      // session cookie first; optional legacy API key still works
      const me = await api.me();
      setProject(me.project);
      setBackends(me.backends ?? []);
      setUserLabel(me.user?.email || me.user?.name || me.project.slug);
      setAuthed(true);
    } catch {
      setAuthed(false);
      setProject(null);
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
      <SignInPage
        onAuthed={() => {
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
          <div className="ml-auto truncate font-mono text-[0.65rem] text-muted-foreground">
            {userLabel}
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
