import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/design-system/lib/cn";

export type InputProps = ComponentPropsWithoutRef<"input">;

export function Input({ type = "text", className, ...props }: InputProps) {
  return <input {...props} type={type} className={cn(
    "disabled:cursor-not-allowed disabled:opacity-[var(--ds-opacity-disabled)] aria-invalid:border-destructive aria-invalid:focus:border-destructive",
    type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    className,
  )} />;
}
