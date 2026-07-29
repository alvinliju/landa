import * as React from "react";
import {
  ActivityIcon,
  CpuIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  SparklesIcon,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/page-header";
import { BackendChip, StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Health, Project, Sandbox } from "@/lib/types";
import { cn } from "@/lib/utils";

export function OverviewPage({
  project,
  backends,
  onCreate,
  onOpenSandbox,
}: {
  project: Project;
  backends: string[];
  onCreate: () => void;
  onOpenSandbox: (id: string) => void;
}) {
  const [health, setHealth] = React.useState<Health | null>(null);
  const [sandboxes, setSandboxes] = React.useState<Sandbox[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([api.health(), api.sandboxes()]);
      setHealth(h);
      setSandboxes(s.sandboxes);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = sandboxes.filter((s) => s.status === "running").length;
  const ttlH = Math.round(project.maxSessionSec / 3600);

  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Console"
        title="Overview"
        description="Control plane for agent computers. Your VMs are scoped to your signed-in account."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => void refresh()}
            >
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" className="h-8 rounded-lg" onClick={onCreate}>
              <PlusIcon />
              New VM
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Project"
          value={project.slug}
          hint={`${project.maxConcurrent} max concurrent · ${ttlH}h TTL`}
          icon={<ServerIcon className="size-3.5" />}
          className="animate-in-up"
        />
        <StatCard
          label="Running"
          value={`${running} / ${project.maxConcurrent}`}
          hint="Active seats on this project"
          icon={<ActivityIcon className="size-3.5" />}
          className="animate-in-up stagger-1"
        />
        <StatCard
          label="API"
          value={health?.ok ? "healthy" : loading ? "…" : "down"}
          hint={health?.db ? "Database connected" : "Checking database…"}
          icon={<SparklesIcon className="size-3.5" />}
          className="animate-in-up stagger-2"
        />
        <StatCard
          label="Backends"
          value={backends.length ? backends.join(" · ") : "—"}
          hint="Registered compute drivers"
          icon={<CpuIcon className="size-3.5" />}
          className="animate-in-up stagger-3"
        />
      </div>

      <Card className="shadow-sm animate-in-up stagger-2">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">
                Your VMs
              </CardTitle>
              <CardDescription className="mt-1">
                Machines owned by your account. Click any row to open exec.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onCreate}
            >
              View all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading && sandboxes.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : sandboxes.length === 0 ? (
            <Empty className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TerminalGlyph />
                </EmptyMedia>
                <EmptyTitle>No VMs yet</EmptyTitle>
                <EmptyDescription>
                  Create a computer for your agent — Firecracker for real VMs,
                  memory for quick smoke tests. Ownership is tied to your user.
                </EmptyDescription>
              </EmptyHeader>
              <Button size="sm" className="h-8 rounded-lg" onClick={onCreate}>
                <PlusIcon />
                Create VM
              </Button>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sandboxes.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSandbox(s.id)}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-border/80 hover:bg-muted/40 hover:shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium tracking-tight">
                      {s.label || s.id.slice(0, 8)}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[0.65rem] text-muted-foreground">
                      {s.id}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <BackendChip backend={s.backend} />
                    <StatusBadge status={s.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function TerminalGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
      <path
        d="M4 7l5 5-5 5M11 17h9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
