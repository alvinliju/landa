import { Badge } from "@/components/ui/badge";
import type { SandboxStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<SandboxStatus, string> = {
  creating: "border-amber-200 bg-amber-50 text-amber-700",
  running: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-sky-200 bg-sky-50 text-sky-700",
  stopped: "border-gray-200 bg-gray-50 text-gray-500",
  destroyed: "border-gray-200 bg-gray-50 text-gray-400",
  error: "border-red-200 bg-red-50 text-red-600",
};

const dots: Partial<Record<SandboxStatus, string>> = {
  creating: "bg-amber-500",
  running: "bg-emerald-500",
  paused: "bg-sky-500",
  error: "bg-red-500",
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
        "rounded-lg border border-gray-100 bg-gray-50 font-mono text-[0.625rem] tracking-tight text-gray-600",
        className,
      )}
    >
      {backend}
    </Badge>
  );
}
