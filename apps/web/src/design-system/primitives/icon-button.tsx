import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/design-system/lib/cn";

export type IconButtonProps = ComponentPropsWithoutRef<"button"> & {
  "aria-label": string;
  size?: "compact" | "regular";
  tone?: "neutral" | "danger";
};

/** Every icon-only action has a required accessible name. */
export function IconButton({ size = "regular", tone = "neutral", type = "button", className, ...props }: IconButtonProps) {
  return <button {...props} type={type} className={cn(
    "inline-grid shrink-0 place-items-center p-0 border-0 rounded-capsule bg-transparent text-muted-foreground pointer-hover:hover:bg-control-hover pointer-hover:hover:text-foreground",
    size === "compact" ? "icon w-[var(--ds-icon-height)] h-[var(--ds-icon-height)] text-subtle [&_svg]:w-[15px] [&_svg]:h-[15px]" : "step w-[var(--ds-control-height)] h-[var(--ds-control-height)] [&_svg]:w-[17px] [&_svg]:h-[17px]",
    tone === "danger" && "danger pointer-hover:hover:bg-[var(--ds-color-danger-hover)] pointer-hover:hover:text-destructive",
    className,
  )} />;
}
