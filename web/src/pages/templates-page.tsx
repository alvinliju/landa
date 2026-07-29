import * as React from "react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "@/components/page-header";
import { BackendChip } from "@/components/status-badge";
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

const blurb: Record<string, string> = {
  "landa-agent":
    "Full offline agent toolkit — python, bash, jq on Alpine Firecracker.",
  "landa-lite": "Minimal seat for smoke tests.",
};

export function TemplatesPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void api
      .templates()
      .then((r) => setTemplates(r.templates))
      .catch((e) => toast.error(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Templates"
        description="Seat recipes — backend, image, and defaults."
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
                  <CardTitle className="font-mono text-sm">{t.slug}</CardTitle>
                  <BackendChip backend={t.backend} />
                </div>
                <CardDescription>{blurb[t.slug] || t.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-[0.65rem] text-muted-foreground">
                  {JSON.stringify(t.config, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
