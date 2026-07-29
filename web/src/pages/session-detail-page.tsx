import * as React from "react";
import {
  ArrowLeftIcon,
  ClockIcon,
  CloudIcon,
  HardDriveIcon,
  NetworkIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { TerminalPanel } from "@/components/terminal-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ExecResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionDetail = {
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
  lastAttachAt: string | null;
};

type LogEntry = {
  id: string;
  at: string;
  kind: "exec" | "event";
  cmd?: string;
  result?: ExecResult;
  message?: string;
};

function cleanStderr(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (l.startsWith("Warning: Permanently added")) return false;
      if (l.includes("post-quantum key exchange")) return false;
      if (l.includes("store now, decrypt later")) return false;
      if (l.includes("The server may need to be upgraded")) return false;
      if (l.startsWith("** WARNING:")) return false;
      return true;
    })
    .join("\n");
}

function logKey(sessionId: string) {
  return `landa.session.logs.${sessionId}`;
}

function loadLogs(sessionId: string): LogEntry[] {
  try {
    const raw = localStorage.getItem(logKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LogEntry[];
    return Array.isArray(parsed) ? parsed.slice(-100) : [];
  } catch {
    return [];
  }
}

function saveLogs(sessionId: string, logs: LogEntry[]) {
  try {
    localStorage.setItem(logKey(sessionId), JSON.stringify(logs.slice(-100)));
  } catch {
    /* ignore quota */
  }
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function SessionDetailPage({
  id,
  onBack,
  onDestroyed,
}: {
  id: string;
  onBack: () => void;
  onDestroyed: () => void;
}) {
  const [session, setSession] = React.useState<SessionDetail | null>(null);
  const [cmd, setCmd] = React.useState("ls -la /workspace");
  const [logs, setLogs] = React.useState<LogEntry[]>(() => loadLogs(id));
  const [workspace, setWorkspace] = React.useState<
    { path: string; size?: number; kind?: string }[] | null
  >(null);
  const [diskHint, setDiskHint] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  const pushLog = React.useCallback(
    (entry: Omit<LogEntry, "id" | "at">) => {
      setLogs((prev) => {
        const next = [
          ...prev,
          {
            ...entry,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            at: new Date().toISOString(),
          },
        ].slice(-100);
        saveLogs(id, next);
        return next;
      });
    },
    [id],
  );

  const load = React.useCallback(async () => {
    const { session: s } = await api.session(id);
    setSession(s as SessionDetail);
    return s as SessionDetail;
  }, [id]);

  React.useEffect(() => {
    setLogs(loadLogs(id));
    void load().catch((e) => toast.error(String(e.message ?? e)));
  }, [id, load]);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function refreshStats() {
    setBusy(true);
    try {
      const s = await load();
      if (s.status === "running") {
        try {
          const list = await api.sessionListFiles(id, "/workspace");
          setWorkspace(
            (list.entries ?? []).map((e) => ({
              path: e.path || e.name || "?",
              size: e.size,
              kind: e.kind,
            })),
          );
        } catch {
          setWorkspace(null);
        }
        try {
          const { result } = await api.sessionExec(
            id,
            "df -h / 2>/dev/null | tail -1; du -sh /workspace 2>/dev/null",
          );
          if (result.exitCode === 0) {
            setDiskHint(result.stdout.trim());
          }
        } catch {
          /* optional */
        }
      } else {
        setWorkspace(null);
        setDiskHint(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    if (!session || session.status !== "running") return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.sessionListFiles(id, "/workspace");
        if (cancelled) return;
        setWorkspace(
          (list.entries ?? []).map((e) => ({
            path: e.path || e.name || "?",
            size: e.size,
            kind: e.kind,
          })),
        );
      } catch {
        if (!cancelled) setWorkspace(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, session?.status]);

  async function runExec(e: React.FormEvent) {
    e.preventDefault();
    if (!cmd.trim()) return;
    setBusy(true);
    try {
      const { result } = await api.sessionExec(id, cmd);
      pushLog({ kind: "exec", cmd, result });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Exec failed";
      pushLog({ kind: "event", message: `exec error: ${msg}` });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    try {
      await api.startSession(id);
      pushLog({ kind: "event", message: "session started — /workspace restored" });
      toast.success("Session started");
      await load();
      await refreshStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await api.stopSession(id);
      pushLog({ kind: "event", message: "session stopped — volume kept on host" });
      toast.success("Session stopped — volume kept");
      setWorkspace(null);
      setDiskHint(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stop failed");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (
      !confirm(
        "Destroy this session and wipe the host volume? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.destroySession(id);
      try {
        localStorage.removeItem(logKey(id));
      } catch {
        /* ignore */
      }
      toast.success("Session destroyed");
      onDestroyed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Destroy failed");
    } finally {
      setBusy(false);
    }
  }

  function clearLogs() {
    setLogs([]);
    saveLogs(id, []);
  }

  if (!session) {
    return (
      <PageContainer className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  const running = session.status === "running";

  return (
    <PageContainer className="flex flex-col gap-6 pb-12">
      <PageHeader
        title={session.name}
        description={
          <span className="font-mono text-xs text-muted-foreground">
            {session.id}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeftIcon />
              Sessions
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void refreshStats()}
            >
              <RefreshCwIcon className={cn(busy && "animate-spin")} />
              Refresh
            </Button>
            {running ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void stop()}
              >
                <SquareIcon />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy || session.status === "destroyed"}
                onClick={() => void start()}
              >
                <PlayIcon />
                Start
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void destroy()}
            >
              <Trash2Icon />
              Destroy
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={session.status} />
        <span className="rounded-md border px-2 py-0.5 text-[0.65rem] text-muted-foreground">
          landa-run · /workspace
        </span>
        {session.error ? (
          <span className="max-w-full truncate rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[0.65rem] text-destructive">
            {session.error}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Status"
          value={session.status}
          hint={running ? "Seat live" : "Volume kept on host when stopped"}
          icon={<CloudIcon className="size-3.5" />}
        />
        <StatCard
          label="Guest IP"
          value={session.guestIp || "—"}
          hint={session.computerId ? `seat ${session.computerId}` : "no seat"}
          icon={<NetworkIcon className="size-3.5" />}
        />
        <StatCard
          label="Created"
          value={fmtTime(session.createdAt)}
          hint={`Updated ${fmtTime(session.updatedAt)}`}
          icon={<ClockIcon className="size-3.5" />}
          mono={false}
        />
        <StatCard
          label="Last attach"
          value={fmtTime(session.lastAttachAt)}
          hint={diskHint ? diskHint.split("\n")[0] : "df after refresh"}
          icon={<HardDriveIcon className="size-3.5" />}
          mono={false}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
            <CardDescription>Session metadata</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <Row label="Name" value={session.name} />
            <Row label="Repo" value={session.repoUrl || "—"} mono />
            <Row label="Computer" value={session.computerId || "—"} mono />
            <Row label="Guest" value={session.guestIp || "—"} mono />
            {session.sshHint ? (
              <div>
                <div className="mb-1 text-muted-foreground">SSH hint</div>
                <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-[0.65rem] leading-relaxed whitespace-pre-wrap">
                  {session.sshHint}
                </pre>
              </div>
            ) : null}
            {diskHint ? (
              <div>
                <div className="mb-1 text-muted-foreground">Disk</div>
                <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-[0.65rem] whitespace-pre-wrap">
                  {diskHint}
                </pre>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" size="sm">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">/workspace</CardTitle>
              <CardDescription>
                {running
                  ? "Listing from guest (list files)"
                  : "Start the session to list files"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!running ? (
              <p className="text-xs text-muted-foreground">
                Session is stopped. Files remain on the host volume until you
                start again.
              </p>
            ) : workspace === null ? (
              <p className="text-xs text-muted-foreground">
                Refresh to load workspace listing.
              </p>
            ) : workspace.length === 0 ? (
              <p className="text-xs text-muted-foreground">Empty workspace.</p>
            ) : (
              <div className="max-h-48 overflow-auto rounded-md border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Type</th>
                      <th className="px-3 py-1.5 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.map((e) => (
                      <tr key={e.path} className="border-t font-mono">
                        <td className="px-3 py-1">{e.path}</td>
                        <td className="px-3 py-1 text-muted-foreground">
                          {e.kind || "—"}
                        </td>
                        <td className="px-3 py-1 text-muted-foreground">
                          {typeof e.size === "number" ? e.size : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TerminalPanel
        title={`landa-run@${session.name} · logs`}
        meta={
          logs.length
            ? `${logs.length} entries`
            : running
              ? "ready"
              : "stopped"
        }
        footer={
          <form className="flex gap-2" onSubmit={runExec}>
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs text-white/30">
                $
              </span>
              <Input
                className="h-9 border-white/10 bg-white/5 pl-7 font-mono text-xs text-white placeholder:text-white/25"
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                placeholder="ls -la /workspace"
                disabled={!running || busy}
                spellCheck={false}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !running || !cmd.trim()}
            >
              <PlayIcon />
              Run
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/15 bg-transparent text-white/80 hover:bg-white/10"
              disabled={!logs.length}
              onClick={clearLogs}
            >
              Clear
            </Button>
          </form>
        }
      >
        <div className="min-h-56 max-h-[28rem] overflow-auto p-4">
          {logs.length === 0 ? (
            <p className="font-mono text-[0.75rem] text-white/30">
              {running
                ? "# run commands — stdout/stderr append here (kept in this browser)"
                : "# start the session to exec; logs stay local to this browser"}
            </p>
          ) : (
            <div className="space-y-4 font-mono text-[0.75rem] leading-relaxed">
              {logs.map((entry) => (
                <div key={entry.id} className="border-b border-white/5 pb-3 last:border-0">
                  <div className="mb-1 text-white/35">
                    {new Date(entry.at).toLocaleTimeString()}
                    {entry.kind === "exec" && entry.result
                      ? ` · exit ${entry.result.exitCode} · ${entry.result.durationMs ?? "?"}ms`
                      : ""}
                  </div>
                  {entry.kind === "event" ? (
                    <div className="text-amber-300/90"># {entry.message}</div>
                  ) : (
                    <>
                      <div className="text-emerald-400/90">
                        $ {entry.cmd}
                      </div>
                      {entry.result?.stdout ? (
                        <pre className="mt-1 whitespace-pre-wrap text-white/90">
                          {entry.result.stdout}
                        </pre>
                      ) : null}
                      {entry.result && cleanStderr(entry.result.stderr) ? (
                        <pre className="mt-1 whitespace-pre-wrap text-red-400">
                          {cleanStderr(entry.result.stderr)}
                        </pre>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </TerminalPanel>
    </PageContainer>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={cn(
          "min-w-0 truncate",
          mono && "font-mono text-[0.7rem]",
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
