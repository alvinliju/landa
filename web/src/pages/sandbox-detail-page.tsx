import * as React from "react";
import {
  ArrowLeftIcon,
  CameraIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "@/components/page-header";
import { BackendChip, StatusBadge } from "@/components/status-badge";
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
import type { ExecResult, Sandbox, WorldSnapshot } from "@/lib/types";

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

export function SandboxDetailPage({
  id,
  onBack,
  onDestroyed,
}: {
  id: string;
  onBack: () => void;
  onDestroyed: () => void;
}) {
  const [sandbox, setSandbox] = React.useState<Sandbox | null>(null);
  const [cmd, setCmd] = React.useState("echo hello-from-landa");
  const [result, setResult] = React.useState<ExecResult | null>(null);
  const [snapshot, setSnapshot] = React.useState<WorldSnapshot | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const { sandbox: s } = await api.sandbox(id);
    setSandbox(s);
  }, [id]);

  React.useEffect(() => {
    void load().catch((e) => toast.error(String(e.message ?? e)));
  }, [load]);

  async function runExec(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { result: r } = await api.exec(id, cmd);
      setResult(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Exec failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSnapshot() {
    setBusy(true);
    try {
      const { snapshot: s } = await api.snapshot(id);
      setSnapshot(s);
      toast.success("Snapshot captured");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Snapshot failed");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    try {
      await api.destroySandbox(id);
      toast.success("VM destroyed");
      onDestroyed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Destroy failed");
    } finally {
      setBusy(false);
    }
  }

  if (!sandbox) {
    return (
      <PageContainer className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </PageContainer>
    );
  }

  const running = sandbox.status === "running";

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title={sandbox.label || sandbox.id.slice(0, 8)}
        description={
          <span className="font-mono text-xs">{sandbox.id}</span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeftIcon />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !running}
              onClick={() => void runSnapshot()}
            >
              <CameraIcon />
              Snapshot
            </Button>
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
        <StatusBadge status={sandbox.status} />
        <BackendChip backend={sandbox.backend} />
        {sandbox.metadata.createMs ? (
          <span className="rounded-md border px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
            boot {sandbox.metadata.createMs}ms
          </span>
        ) : null}
        {sandbox.expires_at ? (
          <span className="rounded-md border px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
            ttl {new Date(sandbox.expires_at).toLocaleString()}
          </span>
        ) : null}
      </div>

      <TerminalPanel
        title={`landa@${sandbox.label || sandbox.id.slice(0, 8)} ~ exec`}
        meta={result ? `exit ${result.exitCode}` : running ? "ready" : "idle"}
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
                placeholder="uname -a"
                disabled={!running}
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
          </form>
        }
      >
        <div className="min-h-48 max-h-96 overflow-auto p-4">
          {result ? (
            <pre className="font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap">
              <span className="text-white/35">
                exit {result.exitCode} · {result.durationMs}ms
                {"\n\n"}
              </span>
              <span className="text-white/90">{result.stdout}</span>
              {cleanStderr(result.stderr) ? (
                <span className="text-red-400">
                  {cleanStderr(result.stderr)}
                </span>
              ) : null}
            </pre>
          ) : (
            <p className="font-mono text-[0.75rem] text-white/30">
              {running
                ? "# run a command to see output here"
                : "# VM is not running"}
            </p>
          )}
        </div>
      </TerminalPanel>

      {snapshot ? (
        <Card>
          <CardHeader>
            <CardTitle>World snapshot</CardTitle>
            <CardDescription>Agent-facing affordances</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-[0.7rem]">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs text-muted-foreground">
            Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto font-mono text-[0.65rem] text-muted-foreground">
            {JSON.stringify(sandbox.metadata, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
