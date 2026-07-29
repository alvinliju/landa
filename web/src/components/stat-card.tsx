import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "relative overflow-hidden bg-card/80 shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-md",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
        aria-hidden
      />
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardDescription className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </CardDescription>
          {icon ? (
            <div className="flex size-7 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
              {icon}
            </div>
          ) : null}
        </div>
        <CardTitle
          className={cn(
            "mt-1 text-lg font-semibold tracking-tight",
            mono && "font-mono text-base",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
