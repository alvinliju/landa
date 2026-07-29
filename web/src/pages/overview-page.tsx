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

  // Product: users only create landa-agent → Firecracker. "memory" is an
  // internal test driver, not a second product option.
  const hasFirecracker = backends.includes("firecracker");
  const runtimeLabel = hasFirecracker
    ? "Firecracker"
    : backends.includes("memory")
      ? "Unavailable"
      : loading
        ? "…"
        : "—";
  const runtimeHint = hasFirecracker
    ? "Isolated VMs for landa-agent seats"
    : backends.includes("memory")
      ? "Firecracker not registered on this host"
      : "Checking seat runtime…";

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Your agent computers. Create VMs, run commands, snapshot, destroy."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
            >
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={onCreate}>
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
        />
        <StatCard
          label="Running"
          value={`${running} / ${project.maxConcurrent}`}
          hint="Active agent VMs on your account"
          icon={<ActivityIcon className="size-3.5" />}
        />
        <StatCard
          label="API"
          value={health?.ok ? "healthy" : loading ? "…" : "down"}
          hint={health?.db ? "Control plane + database" : "Checking…"}
          icon={<SparklesIcon className="size-3.5" />}
        />
        <StatCard
          label="VM runtime"
          value={runtimeLabel}
          hint={runtimeHint}
          icon={<CpuIcon className="size-3.5" />}
          mono={false}
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Your VMs</CardTitle>
          <CardDescription>
            Machines owned by your account. Click to open exec.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {loading && sandboxes.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sandboxes.length === 0 ? (
            <Empty className="border border-dashed py-10">
              <EmptyHeader>
                <EmptyTitle>No VMs yet</EmptyTitle>
                <EmptyDescription>
                  Create a computer for your agent.
                </EmptyDescription>
              </EmptyHeader>
              <Button size="sm" onClick={onCreate}>
                <PlusIcon />
                Create VM
              </Button>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1">
              {sandboxes.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSandbox(s.id)}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {s.label || s.id.slice(0, 8)}
                    </div>
                    <div className="truncate font-mono text-[0.65rem] text-muted-foreground">
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
