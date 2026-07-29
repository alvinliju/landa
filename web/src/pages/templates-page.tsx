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
        description="Seat recipes — backend, image, and defaults. Choose one when you create a VM."
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t, i) => (
            <Card
              key={t.id}
              className={cn(
                "relative overflow-hidden rounded-2xl border-blue-100/80 bg-linear-to-b from-sky-50/30 to-white shadow-sm transition-shadow hover:shadow-md",
                "animate-in-up",
                i === 1 && "stagger-1",
              )}
            >
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl border border-gray-100 bg-white text-gray-700 shadow-xs">
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
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                  <div className="mb-1.5 text-[0.65rem] font-medium tracking-wide text-gray-400 uppercase">
                    Config
                  </div>
                  <pre className="overflow-auto font-mono text-[0.65rem] leading-relaxed text-gray-500">
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
