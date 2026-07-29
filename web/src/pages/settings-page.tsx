import * as React from "react";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { publicApiBase } from "@/lib/navigation";

type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  active: boolean;
};

export function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  const [me, setMe] = React.useState<Awaited<
    ReturnType<typeof api.me>
  > | null>(null);
  const [keys, setKeys] = React.useState<ApiKeyRow[]>([]);
  const [loadingKeys, setLoadingKeys] = React.useState(true);
  const [label, setLabel] = React.useState("agent");
  const [creating, setCreating] = React.useState(false);
  const [freshKey, setFreshKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const refreshKeys = React.useCallback(async () => {
    setLoadingKeys(true);
    try {
      const r = await api.apiKeys();
      setKeys(r.keys);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load keys");
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  React.useEffect(() => {
    void api
      .me()
      .then(setMe)
      .catch((e) => toast.error(String(e.message ?? e)));
    void refreshKeys();
  }, [refreshKeys]);

  async function createKey() {
    setCreating(true);
    setFreshKey(null);
    try {
      const r = await api.createApiKey(label.trim() || "agent");
      setFreshKey(r.key);
      toast.success("API key created — copy it now");
      await refreshKeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeApiKey(id);
      toast.success("Key revoked");
      if (freshKey) setFreshKey(null);
      await refreshKeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    }
  }

  async function copyKey() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
      toast.success("Key copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  const base = publicApiBase();
  const active = keys.filter((k) => k.active);

  return (
    <PageContainer className="flex flex-col gap-6 pb-12">
      <PageHeader
        title="Settings"
        description="Account, project limits, and API keys for agents."
      />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Email / password session.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {!me ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <>
                <Row label="Email" value={me.user?.email || "—"} />
                <Row label="Name" value={me.user?.name || "—"} />
                <Row label="User ID" value={me.user?.id || "—"} mono />
                {me.vms ? (
                  <Row
                    label="Active VMs"
                    value={`${me.vms.active} / ${me.vms.maxConcurrent}`}
                  />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {!me?.project ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <>
                <Row label="Slug" value={me.project.slug} mono />
                <Row
                  label="Concurrent"
                  value={String(me.project.maxConcurrent)}
                />
                <Row
                  label="TTL"
                  value={`${Math.round(me.project.maxSessionSec / 3600)}h`}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <KeyRoundIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>API keys</CardTitle>
                <CardDescription className="mt-1">
                  Create a key for curl or coding agents. Full secret is shown
                  once. See Guide for recipes and{" "}
                  <code className="font-mono text-[0.7rem]">docs/SKILL.md</code>
                  .
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="key-label" className="text-xs">
                  Label
                </Label>
                <Input
                  id="key-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="agent"
                  className="h-9"
                />
              </div>
              <Button
                size="sm"
                className="h-9"
                disabled={creating}
                onClick={() => void createKey()}
              >
                <PlusIcon />
                {creating ? "Creating…" : "Create key"}
              </Button>
            </div>

            {freshKey ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                  Copy this key now — it will not be shown again.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-background px-2 py-1.5 font-mono text-[0.7rem]">
                    {freshKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void copyKey()}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    Copy
                  </Button>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-2 font-mono text-[0.65rem] text-muted-foreground">
                  {`export LANDA_API_KEY='${freshKey}'\nexport LANDA_API_BASE='${base}'`}
                </pre>
              </div>
            ) : null}

            {loadingKeys ? (
              <Skeleton className="h-16 w-full" />
            ) : active.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active keys. Create one to let agents build and destroy VMs.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {active.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {k.label || "key"}
                      </div>
                      <div className="font-mono text-[0.65rem] text-muted-foreground">
                        {k.prefix}…
                        {k.lastUsedAt
                          ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}`
                          : " · never used"}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void revoke(k.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-muted-foreground">
              API base for agents:{" "}
              <code className="font-mono text-[0.7rem]">{base}</code>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-5">
            <div>
              <div className="text-sm font-medium">Sign out</div>
              <p className="text-xs text-muted-foreground">
                Clears this browser session (not API keys).
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
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
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "truncate font-mono text-xs" : "truncate"}>
        {value}
      </span>
    </div>
  );
}
