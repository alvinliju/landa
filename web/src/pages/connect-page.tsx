import * as React from "react";
import { toast } from "sonner";

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
import { api, getApiBase, getApiKey, setApiBase, setApiKey } from "@/lib/api";

export function ConnectPage({ onConnected }: { onConnected: () => void }) {
  const [key, setKey] = React.useState(getApiKey() ?? "");
  const [base, setBase] = React.useState(
    getApiBase() || "http://landa-back.tharavad.xyz",
  );
  const [loading, setLoading] = React.useState(false);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // empty base uses vite proxy in dev; otherwise absolute API origin
      const b = base.trim();
      setApiBase(b === window.location.origin ? "" : b);
      setApiKey(key.trim());
      await api.me();
      toast.success("connected");
      onConnected();
    } catch (err) {
      setApiKey(null);
      toast.error(err instanceof Error ? err.message : "connect failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md ring-1 ring-foreground/10">
        <CardHeader>
          <CardTitle className="font-mono text-lg">landa</CardTitle>
          <CardDescription>
            computers for agents — paste an API key to open the control plane.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={connect}>
            <div className="grid gap-2">
              <Label htmlFor="base">API base</Label>
              <Input
                id="base"
                className="font-mono text-xs"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="http://landa-back.tharavad.xyz"
              />
              <p className="text-[0.65rem] text-muted-foreground">
                production API:{" "}
                <code className="font-mono">http://landa-back.tharavad.xyz</code>
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="key">API key</Label>
              <Input
                id="key"
                type="password"
                autoComplete="off"
                className="font-mono text-xs"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="landa_…"
                required
              />
            </div>
            <Button type="submit" disabled={loading || !key.trim()}>
              {loading ? "connecting…" : "open console"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
