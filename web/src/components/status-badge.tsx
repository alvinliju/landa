import { Badge } from "@/components/ui/badge";
import type { SandboxStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<SandboxStatus, string> = {
  creating: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  running: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  paused: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  stopped: "border-border bg-muted text-muted-foreground",
  destroyed: "border-border bg-muted text-muted-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StatusBadge({
  status,
  className,
}: {
  status: SandboxStatus | string;
  className?: string;
}) {
  const s = (status in styles ? status : "stopped") as SandboxStatus;
  return (
    <Badge
      variant="outline"
      className={cn("font-mono uppercase tracking-wide", styles[s], className)}
    >
      {status}
    </Badge>
  );
}

export function BackendChip({
  backend,
  className,
}: {
  backend: string;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("font-mono", className)}>
      {backend}
    </Badge>
  );
}
