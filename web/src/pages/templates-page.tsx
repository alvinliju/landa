import * as React from "react";
import { BoxesIcon, LayersIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

const blurb: Record<string, string> = {
  "landa-agent":
    "Full offline agent toolkit — python, bash, jq, and more on Alpine Firecracker.",
  "landa-lite":
    "Minimal seat for smoke tests and lightweight command runs.",
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
    <PageContainer className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Catalog"
        title="Templates"
        description="Seat recipes — backend, image, and defaults. Choose one when you create a sandbox."
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t, i) => (
            <Card
              key={t.id}
              className={cn(
                "relative overflow-hidden shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-md",
                "animate-in-up",
                i === 1 && "stagger-1",
              )}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/35 to-transparent"
                aria-hidden
              />
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    {t.slug.includes("agent") ? (
                      <LayersIcon className="size-4" />
                    ) : (
                      <BoxesIcon className="size-4" />
                    )}
                  </div>
                  <BackendChip backend={t.backend} />
                </div>
                <div>
                  <CardTitle className="font-mono text-sm font-semibold tracking-tight">
                    {t.slug}
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm leading-relaxed">
                    {blurb[t.slug] || t.name}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/50 p-3 ring-1 ring-border/50">
                  <div className="mb-1.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                    Config
                  </div>
                  <pre className="overflow-auto font-mono text-[0.65rem] leading-relaxed text-muted-foreground">
                    {JSON.stringify(t.config, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
