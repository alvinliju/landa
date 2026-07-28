import * as React from "react";
import { ArrowLeftIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ExecResult, Sandbox, WorldSnapshot } from "@/lib/types";

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
      toast.error(err instanceof Error ? err.message : "exec failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSnapshot() {
    setBusy(true);
    try {
      const { snapshot: s } = await api.snapshot(id);
      setSnapshot(s);
      toast.success("snapshot ok");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "snapshot failed");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    try {
      await api.destroySandbox(id);
      toast.success("destroyed");
      onDestroyed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "destroy failed");
    } finally {
      setBusy(false);
    }
  }

  if (!sandbox) {
    return (
      <PageContainer className="p-6">
        <p className="text-xs text-muted-foreground">loading…</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="flex flex-col gap-6 p-6">
      <PageHeader
        title={sandbox.label || sandbox.id.slice(0, 8)}
        description={
          <span className="font-mono text-[0.7rem]">{sandbox.id}</span>
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
              disabled={busy || sandbox.status !== "running"}
              onClick={() => void runSnapshot()}
            >
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
        {sandbox.metadata.computerId ? (
          <span className="font-mono text-[0.65rem] text-muted-foreground">
            seat {sandbox.metadata.computerId}
          </span>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exec</CardTitle>
          <CardDescription>
            Runs on the live seat via{" "}
            <code className="font-mono">POST /v1/sandboxes/:id/exec</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex gap-2" onSubmit={runExec}>
            <Input
              className="font-mono text-xs"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="uname -a"
              disabled={sandbox.status !== "running"}
            />
            <Button
              type="submit"
              size="sm"
              disabled={busy || sandbox.status !== "running" || !cmd.trim()}
            >
              <PlayIcon />
              Run
            </Button>
          </form>
          {result ? (
            <pre className="mt-4 max-h-80 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[0.7rem] leading-relaxed">
              <span className="text-muted-foreground">
                exit {result.exitCode} · {result.durationMs}ms
                {"\n"}
              </span>
              {result.stdout}
              {result.stderr ? (
                <span className="text-destructive">{result.stderr}</span>
              ) : null}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      {snapshot ? (
        <Card>
          <CardHeader>
            <CardTitle>World snapshot</CardTitle>
            <CardDescription>Agent-facing affordances JSON</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[0.7rem]">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
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
