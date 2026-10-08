import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/design-system/lib/cn";

export type SurfaceProps = ComponentPropsWithoutRef<"section"> & {
  as?: "section" | "article" | "div";
  elevated?: boolean;
};

/** A visual container. Callers supply its heading, content and accessible name. */
export function Surface({ as: Tag = "section", elevated = false, className, ...props }: SurfaceProps) {
  return <Tag {...props} className={cn(
    "min-w-0 border border-solid border-border rounded-tile text-card-foreground",
    elevated ? "bg-popover shadow-menu" : "bg-card shadow-tile",
    className,
  )} />;
}
