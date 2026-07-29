import * as React from "react";
import {
  PlusIcon,
  RefreshCwIcon,
  TerminalSquareIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "@/components/page-header";
import { BackendChip, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { Sandbox, Template } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SandboxesPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [sandboxes, setSandboxes] = React.useState<Sandbox[]>([]);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [template, setTemplate] = React.useState("landa-agent");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api.sandboxes(), api.templates()]);
      setSandboxes(s.sandboxes);
      const only = t.templates.filter(
        (x) => x.slug === "landa-agent" || x.slug === "landa-lite",
      );
      setTemplates(only.length ? only : t.templates);
      if (!only.find((x) => x.slug === template) && only[0]) {
        setTemplate(only[0].slug);
      }
    } finally {
      setLoading(false);
    }
  }, [template]);

  React.useEffect(() => {
    void refresh().catch((e) => toast.error(String(e.message ?? e)));
  }, [refresh]);

  async function create() {
    setBusy(true);
    try {
      const { sandbox } = await api.createSandbox({
        template,
        label: label.trim() || undefined,
      });
      toast.success("Sandbox created");
      setOpen(false);
      setLabel("");
      await refresh();
      onOpen(sandbox.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.destroySandbox(id);
      toast.success("Sandbox destroyed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Destroy failed");
    }
  }

  return (
    <PageContainer className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Seats"
        title="Sandboxes"
        description="Computers your agents attach to. Create → exec → snapshot → destroy."
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
            <Button
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => setOpen(true)}
            >
              <PlusIcon />
              Create
            </Button>
          </>
        }
      />

      {sandboxes.length === 0 && !loading ? (
        <Empty className="rounded-2xl border border-dashed border-border/80 bg-muted/15 py-16 shadow-xs">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TerminalSquareIcon />
            </EmptyMedia>
            <EmptyTitle>No seats yet</EmptyTitle>
            <EmptyDescription>
              Spin up a computer for your agent. Prefer{" "}
              <span className="font-mono text-foreground/80">landa-agent</span>{" "}
              for a full offline toolkit.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            size="sm"
            className="h-8 rounded-lg"
            onClick={() => setOpen(true)}
          >
            <PlusIcon />
            Create sandbox
          </Button>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/70">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                  Label
                </TableHead>
                <TableHead className="h-10 text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                  Status
                </TableHead>
                <TableHead className="h-10 text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                  Backend
                </TableHead>
                <TableHead className="h-10 text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                  Created
                </TableHead>
                <TableHead className="h-10 w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sandboxes.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer transition-colors"
                  onClick={() => onOpen(s.id)}
                >
                  <TableCell>
                    <div className="text-sm font-medium tracking-tight">
                      {s.label || "Untitled"}
                    </div>
                    <div className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground">
                      {s.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell>
                    <BackendChip backend={s.backend} />
                  </TableCell>
                  <TableCell className="font-mono text-[0.7rem] text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => void destroy(s.id, e)}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <DialogTitle className="text-base">Create sandbox</DialogTitle>
            <DialogDescription>
              Spawns a seat via the control plane. Template selects the image
              and backend.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="template" className="text-xs font-medium">
                Template
              </Label>
              <div className="grid gap-2">
                {templates.map((t) => {
                  const selected = template === t.slug;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(t.slug)}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                        selected
                          ? "border-primary/40 bg-primary/5 shadow-glow"
                          : "border-border/70 bg-card hover:border-border hover:bg-muted/30",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-medium">
                          {t.slug}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t.name}
                        </div>
                      </div>
                      <BackendChip backend={t.backend} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="label" className="text-xs font-medium">
                Label{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="label"
                className="h-9 rounded-lg font-mono text-xs"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="agent-worker-1"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button
              variant="outline"
              className="h-8 rounded-lg"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !template}
              className="h-8 rounded-lg"
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create sandbox"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
