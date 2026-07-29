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
import type { Sandbox } from "@/lib/types";
import { cn } from "@/lib/utils";

const ONLY_TEMPLATE = "landa-agent";

export function SandboxesPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [sandboxes, setSandboxes] = React.useState<Sandbox[]>([]);
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.sandboxes();
      setSandboxes(s.sandboxes);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh().catch((e) => toast.error(String(e.message ?? e)));
  }, [refresh]);

  async function create() {
    setBusy(true);
    try {
      const { sandbox } = await api.createSandbox({
        template: ONLY_TEMPLATE,
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
        description="Agent computers (landa-agent). Create → exec → destroy."
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
              Spins up{" "}
              <span className="font-mono">landa-agent</span> — offline
              python3, bash, and jq on Firecracker.
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
              Uses template{" "}
              <span className="font-mono">landa-agent</span> only. More images
              coming soon.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <div className="font-mono font-medium">{ONLY_TEMPLATE}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Firecracker · offline python3 + bash + jq
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
            <Button disabled={busy} onClick={() => void create()}>
              {busy ? "Creating…" : "Create VM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
