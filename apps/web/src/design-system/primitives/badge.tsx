import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/design-system/lib/cn";

export type BadgeTone = "neutral" | "warning" | "danger";
const tones = {
  neutral: "bg-control-hover text-muted-foreground",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-destructive",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentPropsWithoutRef<"span"> & { tone?: BadgeTone }) {
  return <span {...props} className={cn(
    "inline-flex items-center rounded-capsule px-2 text-ui-caption leading-5 whitespace-nowrap", tones[tone], className,
  )} />;
}
