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
import { api } from "@/lib/api";
import type { Template } from "@/lib/types";

export function TemplatesPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]);

  React.useEffect(() => {
    void api
      .templates()
      .then((r) => setTemplates(r.templates))
      .catch((e) => toast.error(String(e.message ?? e)));
  }, []);

  return (
    <PageContainer className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Templates"
        description="Seat recipes — backend + image/config. memory works; docker needs a daemon; firecracker is spike."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="font-mono text-sm">{t.slug}</CardTitle>
                <BackendChip backend={t.backend} />
              </div>
              <CardDescription>{t.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto font-mono text-[0.65rem] text-muted-foreground">
                {JSON.stringify(t.config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
