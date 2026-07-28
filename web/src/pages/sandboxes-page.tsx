import * as React from "react";
import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { api } from "@/lib/api";
import type { Sandbox, Template } from "@/lib/types";

export function SandboxesPage({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const [sandboxes, setSandboxes] = React.useState<Sandbox[]>([]);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [template, setTemplate] = React.useState("memory-default");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [s, t] = await Promise.all([api.sandboxes(), api.templates()]);
    setSandboxes(s.sandboxes);
    setTemplates(t.templates);
    if (t.templates[0] && !t.templates.find((x) => x.slug === template)) {
      setTemplate(t.templates[0].slug);
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
      toast.success("sandbox created");
      setOpen(false);
      setLabel("");
      await refresh();
      onOpen(sandbox.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.destroySandbox(id);
      toast.success("destroyed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "destroy failed");
    }
  }

  return (
    <PageContainer className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Sandboxes"
        description="Seats your agents attach to. create → exec → snapshot → destroy."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCwIcon />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <PlusIcon />
              Create
            </Button>
          </>
        }
      />

      {sandboxes.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No seats yet</EmptyTitle>
            <EmptyDescription>
              Create a computer for your agent — memory works now, docker when
              the host has a daemon.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setOpen(true)}>
            <PlusIcon />
            Create sandbox
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
                    <div className="font-mono text-xs">
                      {s.label || "—"}
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
                  <TableCell className="font-mono text-[0.65rem] text-muted-foreground">
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
            <DialogTitle>Create sandbox</DialogTitle>
            <DialogDescription>
              Spawns a seat via the control plane. Template selects the backend.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="template">Template</Label>
              <select
                id="template"
                className="flex h-7 w-full rounded-md border border-input bg-input/20 px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.slug} · {t.backend}
                  </option>
                ))}
              </select>
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
            <Button disabled={busy} onClick={() => void create()}>
              {busy ? "creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
