import { cn } from "@/lib/utils";
import { Button } from "@/components/button";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { IconClose } from "@/lib/icons";

/** Native modality contains keyboard focus and restores the trigger on close. */
export function Dialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"dialog w-[min(540px,_calc(100vw_-_32px))] max-h-[calc(100dvh_-_48px)] p-0 border border-solid border-input rounded-[24px] text-foreground [background:#141416] shadow-[var(--shadow)] overflow-y-auto overscroll-contain opacity-[1] [transform:scale(1)] [transition:opacity_200ms_ease,_transform_var(--spring-time)_var(--spring)] [&::backdrop]:[background:rgb(0_0_0_/_0.5)] [&::backdrop]:[-webkit-backdrop-filter:blur(6px)] [&::backdrop]:[backdrop-filter:blur(6px)] starting:[&[open]]:opacity-[0] starting:[&[open]]:[transform:scale(0.96)_translateY(6px)] [&.island-sheet]:[margin:10px_auto_auto] [&.island-sheet]:w-[min(560px,_calc(100vw_-_24px))] [&.island-sheet]:max-h-[calc(100dvh_-_20px)] [&.island-sheet]:[background:#000] [&.island-sheet]:[border-color:rgb(255_255_255_/_0.09)] [&.island-sheet]:rounded-[30px] [&.island-sheet]:[transform-origin:50%_0] [&.island-sheet]:[transition:opacity_160ms_ease,_transform_var(--spring-bounce-time)_var(--spring-bounce),_border-radius_var(--spring-bounce-time)_var(--spring-bounce)] starting:[&.island-sheet[open]]:opacity-[0] starting:[&.island-sheet[open]]:[transform:scale(0.42,_0.08)] starting:[&.island-sheet[open]]:rounded-[18px] max-[761px]:max-h-[calc(100dvh_-_28px)] reduced-transparency:[&::backdrop]:[background:rgb(0_0_0_/_0.8)] reduced-transparency:[&::backdrop]:[-webkit-backdrop-filter:none] reduced-transparency:[&::backdrop]:[backdrop-filter:none] " + className}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className={cn(
        "dialog-heading flex justify-between items-center gap-3 [padding:16px_16px_14px_22px] bg-inherit border-b",
        "[border-bottom-style:solid] border-b-border sticky top-0 z-[2] [&_h2]:[font:650_17px_var(--display)]",
        "[&_h2]:tracking-[-0.015em] [&_.step]:[background:rgb(255_255_255_/_0.07)] [&_.step]:w-7.5 [&_.step]:h-7.5",
        "max-[761px]:[padding:14px_14px_12px_18px]"
      )}>
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="step"
          aria-label={"Close " + title}
          onClick={onClose}
        >
          <IconClose aria-hidden />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
