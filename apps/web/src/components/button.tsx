import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "primary inline-flex items-center justify-center gap-[7px] min-h-[36px] py-[7px] px-4 rounded-full font-[590] text-[13px] whitespace-nowrap bg-primary border border-solid border-primary text-primary-foreground [&_kbd]:[color:#52525b] [&_kbd]:[border-color:rgb(0_0_0_/_0.14)] [&_kbd]:ml-0.5 pointer-hover:[&:hover]:[background:#e4e4e7] pointer-hover:[&:hover]:[border-color:#e4e4e7]",
  secondary: "secondary inline-flex items-center justify-center gap-[7px] min-h-[36px] py-[7px] px-4 rounded-full font-[590] text-[13px] whitespace-nowrap [background:rgb(255_255_255_/_0.06)] border border-solid border-input text-foreground pointer-hover:[&:hover]:[background:rgb(255_255_255_/_0.1)]",
  step: "step inline-grid place-items-center w-8 h-8 p-0 border-0 rounded-full bg-transparent text-muted-foreground pointer-hover:[&:hover]:[background:rgb(255_255_255_/_0.08)] pointer-hover:[&:hover]:text-foreground",
  icon: "icon inline-grid place-items-center w-7.5 h-7.5 p-0 border-0 rounded-full bg-transparent text-subtle [&_svg]:w-[15px] [&_svg]:h-[15px] pointer-hover:[&:hover]:[background:rgb(255_255_255_/_0.08)] pointer-hover:[&:hover]:text-foreground pointer-hover:[&.danger:hover]:[background:rgb(255_105_97_/_0.14)] pointer-hover:[&.danger:hover]:text-destructive",
  utility: "utility grid place-items-center w-8.5 h-8.5 p-0 border-0 rounded-full bg-transparent text-muted-foreground [&_svg]:w-[17px] [&_svg]:h-[17px] pointer-hover:[&:hover]:[background:rgb(255_255_255_/_0.08)] pointer-hover:[&:hover]:text-foreground",
};

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant: keyof typeof variants;
};

/** Shared capsule controls. Labels, keyboard behavior and actions stay with callers. */
export function Button({ variant, className, ...props }: ButtonProps) {
  return <button {...props} className={cn(variants[variant], className)} />;
}
