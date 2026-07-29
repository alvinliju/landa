import * as React from "react";
import { LogOutIcon, UserIcon } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
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
    <PageContainer className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your free-tier project and session. Sign out ends the console session on this browser."
      />

      <div className="grid max-w-2xl gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0 border-b border-border/60 pb-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <UserIcon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">Account</CardTitle>
              <CardDescription className="mt-0.5">
                Signed in with email and password (Better Auth).
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {!me ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-36" />
              </div>
            ) : (
              <dl className="grid gap-3 text-sm">
                <Row label="Email" value={me.user?.email || "—"} />
                <Row label="Name" value={me.user?.name || "—"} />
                <Row label="Auth" value={me.via || "session"} mono />
              </dl>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base font-semibold">Project</CardTitle>
            <CardDescription>
              Free project created on first sign-in. Limits apply per seat.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            {!me?.project ? (
              <Skeleton className="h-4 w-56" />
            ) : (
              <dl className="grid gap-3 text-sm">
                <Row label="Slug" value={me.project.slug} mono />
                <Row
                  label="Concurrent"
                  value={String(me.project.maxConcurrent)}
                />
                <Row
                  label="Session TTL"
                  value={`${Math.round(me.project.maxSessionSec / 3600)} hours`}
                />
                {me.backends?.length ? (
                  <Row label="Backends" value={me.backends.join(" · ")} mono />
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Sign out</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clears your session cookie on this device.
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 w-fit rounded-lg"
              onClick={onSignOut}
            >
              <LogOutIcon />
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
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "truncate font-mono text-xs text-foreground"
            : "truncate text-sm text-foreground"
        }
      >
        {value}
      </dd>
      <Separator className="sr-only" />
    </div>
  );
}
