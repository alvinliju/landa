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
import { api } from "@/lib/api";

export function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  const [me, setMe] = React.useState<Awaited<
    ReturnType<typeof api.me>
  > | null>(null);

  React.useEffect(() => {
    void api
      .me()
      .then(setMe)
      .catch((e) => toast.error(String(e.message ?? e)));
  }, []);

  return (
    <PageContainer className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Settings"
        description="Account and free-tier project. Sign out ends your session."
      />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Free access behind email/password (Better Auth).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 font-mono text-xs">
          {me?.user ? (
            <>
              <div>email · {me.user.email}</div>
              <div>name · {me.user.name || "—"}</div>
              <div>via · {me.via}</div>
            </>
          ) : (
            <div className="text-muted-foreground">loading…</div>
          )}
          {me?.project ? (
            <>
              <div className="mt-2">project · {me.project.slug}</div>
              <div>
                limits · {me.project.maxConcurrent} concurrent ·{" "}
                {Math.round(me.project.maxSessionSec / 3600)}h TTL
              </div>
            </>
          ) : null}
          <Button
            size="sm"
            variant="destructive"
            className="mt-2 w-fit"
            onClick={onSignOut}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
