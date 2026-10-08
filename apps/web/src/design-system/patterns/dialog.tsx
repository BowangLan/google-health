import { IconButton } from "@/design-system/primitives/icon-button";
import { cn } from "@/design-system/lib/cn";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { IconClose } from "@/design-system/foundations/icons";

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
      className={"dialog w-[min(var(--ds-dialog-width),_calc(100vw_-_32px))] max-h-[calc(100dvh_-_48px)] p-0 border border-solid border-input rounded-modal text-foreground bg-[var(--ds-dialog-background)] shadow-[var(--ds-shadow-overlay)] overflow-y-auto overscroll-contain opacity-[1] [transform:scale(1)] [transition:opacity_200ms_ease,_transform_var(--ds-duration-spring)_var(--ds-ease-spring)] [&::backdrop]:[background:var(--ds-color-scrim)] [&::backdrop]:[-webkit-backdrop-filter:blur(6px)] [&::backdrop]:[backdrop-filter:blur(6px)] starting:[&[open]]:opacity-[0] starting:[&[open]]:[transform:scale(0.96)_translateY(6px)] [&.island-sheet]:[margin:10px_auto_auto] [&.island-sheet]:w-[min(560px,_calc(100vw_-_24px))] [&.island-sheet]:max-h-[calc(100dvh_-_20px)] [&.island-sheet]:bg-island [&.island-sheet]:[border-color:var(--ds-dialog-island-border)] [&.island-sheet]:rounded-[var(--ds-radius-island)] [&.island-sheet]:[transform-origin:50%_0] [&.island-sheet]:[transition:opacity_160ms_ease,_transform_var(--ds-duration-island)_var(--ds-ease-island),_border-radius_var(--ds-duration-island)_var(--ds-ease-island)] starting:[&.island-sheet[open]]:opacity-[0] starting:[&.island-sheet[open]]:[transform:scale(0.42,_0.08)] starting:[&.island-sheet[open]]:rounded-[18px] max-[761px]:max-h-[calc(100dvh_-_28px)] reduced-transparency:[&::backdrop]:[background:var(--ds-color-scrim-solid)] reduced-transparency:[&::backdrop]:[-webkit-backdrop-filter:none] reduced-transparency:[&::backdrop]:[backdrop-filter:none] " + className}
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
        "dialog-heading flex justify-between items-center gap-3 [padding:18px_18px_16px_24px] bg-inherit border-b",
        "[border-bottom-style:solid] border-b-border sticky top-0 z-[2] [&_h2]:[font:650_17px_var(--ds-font-display)]",
        "[&_h2]:tracking-[-0.015em] [&_h2]:min-w-0 [&_h2]:leading-6 [&_.step]:[background:var(--ds-dialog-close-background)] [&_.step]:w-11 [&_.step]:h-11 [&_.step_svg]:w-4 [&_.step_svg]:h-4",
        "max-[761px]:[padding:16px_14px_14px_20px]"
      )}>
        <h2 id={titleId}>{title}</h2>
        <IconButton
          size="regular"
          aria-label={"Close " + title}
          onClick={onClose}
        >
          <IconClose aria-hidden />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
