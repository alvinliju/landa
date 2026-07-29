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
      toast.success("VM created");
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
      toast.success("VM destroyed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Destroy failed");
    }
  }

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="VMs"
        description="Agent computers owned by your account."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <PlusIcon />
              Create
            </Button>
          </>
        }
      />

      {sandboxes.length === 0 && !loading ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TerminalSquareIcon />
            </EmptyMedia>
            <EmptyTitle>No VMs yet</EmptyTitle>
            <EmptyDescription>
              Prefer{" "}
              <span className="font-mono">landa-agent</span> for a full offline
              toolkit.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setOpen(true)}>
            <PlusIcon />
            Create VM
          </Button>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Backend</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sandboxes.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(s.id)}
                >
                  <TableCell>
                    <div className="text-sm font-medium">
                      {s.label || "Untitled"}
                    </div>
                    <div className="font-mono text-[0.65rem] text-muted-foreground">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create VM</DialogTitle>
            <DialogDescription>
              Spawns a machine owned by your account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="template">Template</Label>
              <div className="grid gap-2">
                {templates.map((t) => {
                  const selected = template === t.slug;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(t.slug)}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                        selected
                          ? "border-foreground/20 bg-muted"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <div>
                        <div className="font-mono font-medium">{t.slug}</div>
                        <div className="text-xs text-muted-foreground">
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
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                className="font-mono text-xs"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="agent-worker-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !template}
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create VM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
