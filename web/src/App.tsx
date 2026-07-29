import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

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
import { loadMe, setApiKey } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  pageFromPath,
  pagePaths,
  pageTitles,
  sandboxPath,
  sessionPath,
  type LandaPage,
} from "@/lib/navigation";
import type { Project } from "@/lib/types";
import { ApiKeysPage } from "@/pages/api-keys-page";
import { GuidePage } from "@/pages/guide-page";
import { OverviewPage } from "@/pages/overview-page";
import { SandboxDetailPage } from "@/pages/sandbox-detail-page";
import { SandboxesPage } from "@/pages/sandboxes-page";
import { SessionDetailPage } from "@/pages/session-detail-page";
import { SessionsPage } from "@/pages/sessions-page";
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

  const applyMe = React.useCallback(
    (me: Awaited<ReturnType<typeof loadMe>>) => {
      setProject(me.project);
      setBackends(me.backends ?? []);
      setUser(me.user ?? null);
      setAuthed(true);
    },
    [],
  );

  /** Initial page load + post sign-in. Returns true when console can open. */
  const boot = React.useCallback(
    async (opts?: { retries?: number; quiet?: boolean }): Promise<boolean> => {
      try {
        const me = await loadMe(opts?.retries ?? 5);
        applyMe(me);
        return true;
      } catch {
        setAuthed(false);
        setProject(null);
        setUser(null);
        if (!opts?.quiet) {
          /* initial visit without session is expected */
        }
        return false;
      } finally {
        setReady(true);
      }
    },
    [applyMe],
  );

  React.useEffect(() => {
    void boot({ quiet: true });
  }, [boot]);

  React.useEffect(() => {
    const onPop = () => setRoute(pageFromPath(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(page: Exclude<LandaPage, "sandbox" | "session">) {
    history.pushState({}, "", pagePaths[page]);
    setRoute({ page });
  }

  function openSandbox(id: string) {
    history.pushState({}, "", sandboxPath(id));
    setRoute({ page: "sandbox", sandboxId: id });
  }

  function openSession(id: string) {
    history.pushState({}, "", sessionPath(id));
    setRoute({ page: "session", sessionId: id });
  }

  /** Called after Better Auth sign-in / sign-up succeeds. */
  async function enterConsole(): Promise<void> {
    setReady(false);
    try {
      // confirm cookie session is visible to the client
      for (let i = 0; i < 6; i++) {
        const { data } = await authClient.getSession();
        if (data?.session && data?.user) break;
        await new Promise((r) => setTimeout(r, 50 + i * 50));
      }

      const ok = await boot({ retries: 8, quiet: true });
      if (!ok) {
        throw new Error(
          "Signed in, but the console could not load your project. Try again.",
        );
      }
      // land on overview after auth
      history.replaceState({}, "", pagePaths.overview);
      setRoute({ page: "overview" });
    } catch (e) {
      setReady(true);
      setAuthed(false);
      setProject(null);
      const msg = e instanceof Error ? e.message : "Could not open console";
      toast.error(msg);
      throw e;
    }
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
    history.replaceState({}, "", pagePaths.overview);
    setRoute({ page: "overview" });
  }

  if (!ready) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-muted">
        <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading console…</p>
      </div>
    );
  }

  if (!authed || !project) {
    return <SignInPage onAuthed={enterConsole} />;
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
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {route.page === "overview" ? (
            <OverviewPage
              project={project}
              backends={backends}
              onCreate={() => navigate("sandboxes")}
              onOpenSandbox={openSandbox}
            />
          ) : null}
          {route.page === "sessions" ? (
            <SessionsPage onOpen={openSession} />
          ) : null}
          {route.page === "session" && route.sessionId ? (
            <SessionDetailPage
              id={route.sessionId}
              onBack={() => navigate("sessions")}
              onDestroyed={() => navigate("sessions")}
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
          {route.page === "api-keys" ? <ApiKeysPage /> : null}
          {route.page === "guide" ? <GuidePage /> : null}
          {route.page === "settings" ? (
            <SettingsPage onSignOut={() => void handleSignOut()} />
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
