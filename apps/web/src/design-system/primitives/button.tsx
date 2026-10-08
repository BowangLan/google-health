import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/design-system/lib/cn";

const variants = {
  primary:
    "primary bg-[var(--ds-button-background)] border-primary text-[var(--ds-button-foreground)] [&_kbd]:text-on-action-muted [&_kbd]:border-[var(--ds-button-key-border)] [&_kbd]:ml-0.5 pointer-hover:hover:bg-[var(--ds-button-hover)] pointer-hover:hover:border-action-hover",
  secondary:
    "secondary bg-[var(--ds-button-secondary-background)] border-input text-foreground pointer-hover:hover:bg-[var(--ds-button-secondary-hover)]",
  danger:
    "danger bg-danger-muted border-[var(--ds-color-danger-border)] text-destructive pointer-hover:hover:bg-[var(--ds-color-danger-hover)]",
  ghost:
    "border-transparent bg-transparent text-muted-foreground pointer-hover:hover:bg-control-hover pointer-hover:hover:text-foreground",
};

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: keyof typeof variants;
};

/** A native action. Explicit submit buttons opt into form submission. */
export function Button({
  variant = "secondary",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-[7px] min-h-[var(--ds-button-height)] py-[7px] px-4 rounded-[var(--ds-button-radius)] border border-solid font-control text-ui-body leading-5 whitespace-nowrap [&_svg]:shrink-0",
        variants[variant],
        className,
      )}
    />
  );
}
