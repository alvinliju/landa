import * as React from "react";
import {
  CloudIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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
import { cn } from "@/lib/utils";

type SessionRow = {
  id: string;
  name: string;
  status: string;
  repoUrl: string | null;
  computerId: string | null;
  guestIp: string | null;
  sshHint: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export function SessionsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [repo, setRepo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.sessions();
      setSessions(r.sessions as SessionRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    setBusy(true);
    try {
      const r = await api.createSession({
        name: name.trim() || undefined,
        repo: repo.trim() || undefined,
      });
      toast.success(`Session ${r.session.name} running`);
      setOpen(false);
      setName("");
      setRepo("");
      await refresh();
      onOpen(r.session.id);
    } catch (e) {
      const body =
        e && typeof e === "object" && "body" in e
          ? (e as { body: { message?: string } }).body
          : null;
      toast.error(body?.message || (e instanceof Error ? e.message : "Create failed"));
    } finally {
      setBusy(false);
    }
  }

  async function start(id: string) {
    setBusy(true);
    try {
      await api.startSession(id);
      toast.success("Session started — workspace restored");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  }

  async function stop(id: string) {
    setBusy(true);
    try {
      await api.stopSession(id);
      toast.success("Session stopped — volume kept");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stop failed");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(id: string) {
    setBusy(true);
    try {
      await api.destroySession(id);
      toast.success("Session destroyed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Destroy failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer className="flex flex-col gap-6 pb-12">
      <PageHeader
        title="Sessions"
        description="landa-run v0: persistent workspace on the host. stop keeps files; start boots a new seat and restores /workspace."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <PlusIcon />
              New session
            </Button>
          </>
        }
      />

      {sessions.length === 0 && !loading ? (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CloudIcon />
            </EmptyMedia>
            <EmptyTitle>No sessions yet</EmptyTitle>
            <EmptyDescription>
              Create a long-lived run seat. Optional git clone into the
              workspace. Agent can live here; VMs tab is for disposable workers.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setOpen(true)}>
            <PlusIcon />
            New session
          </Button>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(s.id)}
                >
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    <div className="font-mono text-[0.65rem] text-muted-foreground">
                      {s.id.slice(0, 8)}…
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                    {s.error ? (
                      <div className="mt-1 max-w-[12rem] truncate text-[0.65rem] text-destructive">
                        {s.error}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate font-mono text-[0.65rem] text-muted-foreground">
                    {s.repoUrl || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[0.65rem] text-muted-foreground">
                    {s.guestIp || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {s.status === "running" ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void stop(s.id)}
                          title="Stop (keep volume)"
                        >
                          <SquareIcon />
                        </Button>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy || s.status === "destroyed"}
                          onClick={() => void start(s.id)}
                          title="Start (restore /workspace)"
                        >
                          <PlayIcon />
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void destroy(s.id)}
                        title="Destroy session + volume"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
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
            <DialogTitle>New session</DialogTitle>
            <DialogDescription>
              Boots a Firecracker seat and syncs a host volume to{" "}
              <code className="font-mono text-xs">/workspace</code>. Optional
              public git clone on the API host.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="sname">Name</Label>
              <Input
                id="sname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="myapp"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srepo">
                Repo URL{" "}
                <span className="font-normal text-muted-foreground">
                  (optional, https)
                </span>
              </Label>
              <Input
                id="srepo"
                className="font-mono text-xs"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="https://github.com/you/repo.git"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void create()}>
              {busy ? "Creating…" : "Create & start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
