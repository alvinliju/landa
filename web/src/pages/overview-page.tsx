import * as React from "react";
import { PlusIcon, RefreshCwIcon } from "lucide-react";

import { PageContainer, PageHeader } from "@/components/page-header";
import { BackendChip, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Health, Project, Sandbox } from "@/lib/types";

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

  return (
    <PageContainer className="flex flex-col gap-8 p-6">
      <PageHeader
        title="Overview"
        description="Control plane for agent computers. Create seats, exec, snapshot, destroy."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCwIcon />
              Refresh
            </Button>
            <Button size="sm" onClick={onCreate}>
              <PlusIcon />
              New sandbox
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Project"
          value={project.slug}
          hint={`${project.maxConcurrent} max concurrent`}
        />
        <Stat
          label="Running"
          value={`${running} / ${project.maxConcurrent}`}
          hint="active seats"
        />
        <Stat
          label="API"
          value={health?.ok ? "ok" : loading ? "…" : "down"}
          hint={health?.db ? "db connected" : "db unknown"}
        />
        <Stat
          label="Backends"
          value={backends.join(", ") || "—"}
          hint="registered drivers"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sandboxes</CardTitle>
          <CardDescription>
            Live seats from{" "}
            <code className="font-mono text-[0.7rem]">GET /v1/sandboxes</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sandboxes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No seats yet — create a computer for your agent.
            </p>
          ) : (
            sandboxes.slice(0, 8).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenSandbox(s.id)}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">
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
            ))
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-base tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-[0.65rem] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
