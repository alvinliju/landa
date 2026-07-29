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
    <Card size="sm" className={cn(className)}>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          {icon ? (
            <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {icon}
            </div>
          ) : null}
        </div>
        <CardTitle
          className={cn(
            "mt-1 text-base font-semibold tracking-tight",
            mono && "font-mono",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
