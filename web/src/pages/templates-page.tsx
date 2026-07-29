import * as React from "react";
import { BoxesIcon, ClockIcon, LayersIcon } from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "@/components/page-header";
import { BackendChip } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Template } from "@/lib/types";

const COMING_SOON = [
  {
    slug: "landa-lite",
    name: "Landa lite",
    blurb: "Minimal shell smoke image — smaller and faster boots.",
  },
  {
    slug: "landa-node",
    name: "Landa node",
    blurb: "Node.js toolchain for JS/TS agent jobs.",
  },
  {
    slug: "landa-browser",
    name: "Landa browser",
    blurb: "Headless browser seat for web automation.",
  },
];

export function TemplatesPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void api
      .templates()
      .then((r) => {
        // product: only agent is live
        setTemplates(r.templates.filter((t) => t.slug === "landa-agent"));
      })
      .catch((e) => toast.error(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Templates"
        description="Seat recipes. Only landa-agent is available today — more images coming soon."
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                      <LayersIcon className="size-4" />
                    </div>
                    <div>
                      <CardTitle className="font-mono text-sm">
                        {t.slug}
                      </CardTitle>
                      <CardDescription className="mt-0.5">
                        Offline agent computer — python3, bash, jq on Firecracker.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge>Available</Badge>
                    <BackendChip backend={t.backend} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-[0.65rem] text-muted-foreground">
                  {JSON.stringify(t.config, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}

          {COMING_SOON.map((t) => (
            <Card key={t.slug} className="opacity-80">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                      <BoxesIcon className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="font-mono text-sm text-muted-foreground">
                        {t.slug}
                      </CardTitle>
                      <CardDescription className="mt-0.5">
                        {t.blurb}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <ClockIcon className="size-3" />
                    Coming soon
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Not creatable yet. Use{" "}
                  <code className="font-mono">landa-agent</code> for all jobs.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
