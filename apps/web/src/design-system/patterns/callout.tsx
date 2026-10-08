import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/design-system/lib/cn";

const tones = {
  info: "border-border bg-popover text-muted-foreground",
  warning: "border-warning-border bg-warning-muted text-warning",
  danger: "border-[var(--ds-color-danger-border)] bg-danger-muted text-destructive",
};

/** Set role="alert" for a new failure; persistent explanatory copy stays quiet. */
export function Callout({ tone = "info", className, ...props }: ComponentPropsWithoutRef<"div"> & { tone?: keyof typeof tones }) {
  return <div {...props} className={cn("border border-solid rounded-lg px-3.5 py-3 text-ui-label leading-relaxed", tones[tone], className)} />;
}
