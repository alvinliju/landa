import * as React from "react";
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
import {
  getApiBase,
  getApiKey,
  setApiBase,
  setApiKey,
} from "@/lib/api";

export function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  const [base, setBase] = React.useState(
    getApiBase() || "http://landa-back.tharavad.xyz",
  );
  const key = getApiKey();

  function save() {
    setApiBase(base.trim());
    toast.success("saved");
  }

  return (
    <PageContainer className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Settings"
        description="API connection for this browser. Key stays in localStorage."
      />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Browser stores the API base and key for this console only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>API base</Label>
            <Input
              className="font-mono text-xs"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>API key</Label>
            <Input
              className="font-mono text-xs"
              value={key ? `${key.slice(0, 16)}…` : "—"}
              readOnly
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              Save base
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setApiKey(null);
                onSignOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
