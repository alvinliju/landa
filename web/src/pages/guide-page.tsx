import * as React from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
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
import { publicApiBase } from "@/lib/navigation";

function CopyBlock({
  label,
  text,
  mono = true,
}: {
  label?: string;
  text: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }
  return (
    <div className="rounded-lg border bg-muted/40">
      {label ? (
        <div className="flex items-center justify-between border-b px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <Button variant="ghost" size="xs" onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
      <pre
        className={
          mono
            ? "overflow-x-auto p-3 font-mono text-[0.7rem] leading-relaxed"
            : "overflow-x-auto p-3 text-xs leading-relaxed"
        }
      >
        {text}
      </pre>
      {!label ? (
        <div className="flex justify-end border-t px-2 py-1">
          <Button variant="ghost" size="xs" onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            Copy
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function GuidePage() {
  const base = publicApiBase();
  const envBlock = `export LANDA_API_BASE='${base}'
export LANDA_API_KEY='landa_…'   # from Settings → API keys`;

  const createFlow = `# 1. Create a VM
curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"template":"landa-agent","label":"agent-job"}' \\
  "$LANDA_API_BASE/v1/sandboxes"

# 2. Exec (use sandbox.id from the response)
curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"cmd":"uname -a && python3 --version"}' \\
  "$LANDA_API_BASE/v1/sandboxes/<SANDBOX_ID>/exec"

# 3. Always destroy when done
curl -sS -X DELETE -H "Authorization: Bearer $LANDA_API_KEY" \\
  "$LANDA_API_BASE/v1/sandboxes/<SANDBOX_ID>"`;

  const skillHint = `Give your coding agent:

1. LANDA_API_KEY (create under API keys in the console)
2. LANDA_API_BASE=${base}
3. The skill file from the landa repo: docs/SKILL.md

Agents should: create → exec → destroy, prefer template landa-agent,
and never log the full API key.`;

  return (
    <PageContainer className="flex flex-col gap-6 pb-12">
      <PageHeader
        title="Guide"
        description="API keys, curl recipes, and how agents should drive landa VMs."
      />

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-muted">
              <KeyRoundIcon className="size-4" />
            </div>
            <div>
              <CardTitle>1. Create an API key</CardTitle>
              <CardDescription className="mt-1">
                Keys are hashed at rest. The full secret is shown only once when
                you create it — open Settings to generate one, then paste it
                into your agent or shell.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Path:{" "}
            <span className="font-medium text-foreground">API keys</span> →{" "}
            <span className="font-medium text-foreground">Create key</span>
          </p>
          <CopyBlock label="Environment" text={envBlock} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Base URL</CardTitle>
          <CardDescription>
            Same-origin proxy from the console host. Agents can also hit the
            API host directly if published.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <CopyBlock label="API base (this host)" text={base} />
          <CopyBlock
            label="Auth header"
            text="Authorization: Bearer $LANDA_API_KEY"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Create → exec → destroy</CardTitle>
          <CardDescription>
            Only template{" "}
            <code className="font-mono text-xs">landa-agent</code> is live
            (Firecracker + offline tools). Other templates: coming soon. Seats
            expire after 8 hours if you forget to destroy them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyBlock label="Shell" text={createFlow} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Endpoints</CardTitle>
          <CardDescription>All require the Bearer key except health.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[0.7rem]">
                {(
                  [
                    ["GET", "/health", "no auth"],
                    ["GET", "/v1/me", "project + limits"],
                    ["GET", "/v1/templates", "landa-agent only"],
                    ["GET", "/v1/sandboxes", "list your VMs"],
                    ["POST", "/v1/sandboxes", "create { template, label? }"],
                    ["POST", "/v1/sandboxes/:id/exec", '{ "cmd": "…" }'],
                    ["POST", "/v1/sandboxes/:id/snapshot", "world JSON"],
                    ["DELETE", "/v1/sandboxes/:id", "destroy"],
                    ["GET", "/v1/api-keys", "list key prefixes"],
                    ["POST", "/v1/api-keys", "create (returns secret once)"],
                    ["DELETE", "/v1/api-keys/:id", "revoke"],
                  ] as const
                ).map(([m, p, n]) => (
                  <tr key={p + m} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{m}</td>
                    <td className="px-3 py-2">{p}</td>
                    <td className="px-3 py-2 font-sans text-muted-foreground">
                      {n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Hand this to an agent</CardTitle>
          <CardDescription>
            Repo skill: <code className="font-mono text-xs">docs/SKILL.md</code>{" "}
            — name <code className="font-mono text-xs">landa-vms</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CopyBlock label="Agent brief" text={skillHint} mono={false} />
          <p className="text-xs text-muted-foreground">
            Full skill with TypeScript sketch lives in the landa repository at{" "}
            <code className="font-mono">docs/SKILL.md</code>. Point coding
            assistants at that file plus a fresh API key from Settings.
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
