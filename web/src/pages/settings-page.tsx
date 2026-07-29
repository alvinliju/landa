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
import { Skeleton } from "@/components/ui/skeleton";
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
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Account and free-tier project."
      />
      <div className="grid max-w-lg gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Email / password (Better Auth).</CardDescription>
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
            <Button
              variant="destructive"
              size="sm"
              className="mt-2 w-fit"
              onClick={onSignOut}
            >
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
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
