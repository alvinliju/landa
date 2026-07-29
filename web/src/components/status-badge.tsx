import { Badge } from "@/components/ui/badge";
import type { SandboxStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<SandboxStatus, string> = {
  creating:
    "border-warning/25 bg-warning/10 text-warning dark:border-warning/30 dark:bg-warning/12 dark:text-warning",
  running:
    "border-success/25 bg-success/10 text-success dark:border-success/30 dark:bg-success/12 dark:text-success",
  paused:
    "border-info/25 bg-info/10 text-info dark:border-info/30 dark:bg-info/12 dark:text-info",
  stopped: "border-border bg-muted/80 text-muted-foreground",
  destroyed: "border-border bg-muted/60 text-muted-foreground",
  error:
    "border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/30",
};

const dots: Partial<Record<SandboxStatus, string>> = {
  creating: "bg-warning",
  running: "bg-success",
  paused: "bg-info",
  error: "bg-destructive",
};

export function StatusBadge({
  status,
  className,
  pulse,
}: {
  status: SandboxStatus | string;
  className?: string;
  pulse?: boolean;
}) {
  const s = (status in styles ? status : "stopped") as SandboxStatus;
  const showPulse = pulse ?? (s === "running" || s === "creating");
  const dot = dots[s];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full font-mono text-[0.625rem] tracking-wide uppercase",
        styles[s],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            dot,
            showPulse && "pulse-dot",
          )}
        />
      ) : null}
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
    <Badge
      variant="secondary"
      className={cn(
        "rounded-md font-mono text-[0.625rem] tracking-tight",
        className,
      )}
    >
      {backend}
    </Badge>
  );
}
