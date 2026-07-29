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

/** Drop OpenSSH client noise from exec stderr (host keys, PQ warnings). */
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
      toast.success("Sandbox destroyed");
      onDestroyed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Destroy failed");
    } finally {
      setBusy(false);
    }
  }

  if (!sandbox) {
    return (
      <PageContainer className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-8 w-full max-w-md rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageContainer>
    );
  }

  const running = sandbox.status === "running";

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow={sandbox.user_id ? "Your VM" : "VM"}
        title={sandbox.label || sandbox.id.slice(0, 8)}
        description={
          <span className="font-mono text-[0.75rem] text-muted-foreground">
            {sandbox.id}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
              onClick={onBack}
            >
              <ArrowLeftIcon />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
              disabled={busy || !running}
              onClick={() => void runSnapshot()}
            >
              <CameraIcon />
              Snapshot
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-9 rounded-xl"
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
        {sandbox.metadata.computerId ? (
          <MetaChip label="seat" value={sandbox.metadata.computerId} />
        ) : null}
        {sandbox.metadata.createMs ? (
          <MetaChip label="boot" value={`${sandbox.metadata.createMs}ms`} />
        ) : null}
        {sandbox.expires_at ? (
          <MetaChip
            label="ttl"
            value={new Date(sandbox.expires_at).toLocaleString()}
          />
        ) : null}
      </div>

      <TerminalPanel
        title={`landa@${sandbox.label || sandbox.id.slice(0, 8)} ~ exec`}
        meta={result ? `exit ${result.exitCode}` : running ? "ready" : "idle"}
        className="shadow-md"
        footer={
          <form className="flex gap-2" onSubmit={runExec}>
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs text-white/30">
                $
              </span>
              <Input
                className="h-9 rounded-lg border-white/10 bg-white/4 pl-7 font-mono text-xs text-white placeholder:text-white/25 focus-visible:border-primary/50 focus-visible:ring-primary/20"
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
              className="h-9 rounded-lg"
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
                <span className="text-[#ff7b82]">
                  {cleanStderr(result.stderr)}
                </span>
              ) : null}
            </pre>
          ) : (
            <p className="font-mono text-[0.75rem] text-white/30">
              {running
                ? "# run a command to see output here"
                : "# sandbox is not running"}
            </p>
          )}
        </div>
      </TerminalPanel>

      {snapshot ? (
        <Card className="rounded-2xl border-blue-100/80 shadow-sm">
          <CardHeader className="border-b border-blue-50">
            <CardTitle className="text-base">World snapshot</CardTitle>
            <CardDescription>
              Agent-facing affordances from the live seat
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="max-h-96 overflow-auto rounded-xl border border-gray-100 bg-gray-50 p-4 font-mono text-[0.7rem] leading-relaxed">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm" className="rounded-2xl border-blue-100/80 shadow-xs">
        <CardHeader>
          <CardTitle className="text-xs font-medium tracking-wide text-gray-400 uppercase">
            Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto font-mono text-[0.65rem] leading-relaxed text-gray-500">
            {JSON.stringify(sandbox.metadata, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-1 font-mono text-[0.65rem] text-gray-500">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700">{value}</span>
    </span>
  );
}
