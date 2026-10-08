import { cn } from "@/design-system/lib/cn";

export const segmentedControlClassName = [
  "seg inline-flex ml-auto p-0.5 rounded-capsule bg-[var(--ds-segment-background)] border border-solid border-border",
  "[&_button]:min-w-[42px] [&_button]:py-[5px] [&_button]:px-3 [&_button]:border-0 [&_button]:rounded-capsule",
  "[&_button]:bg-transparent [&_button]:text-muted-foreground [&_button]:text-ui-label [&_button]:font-control [&_button]:leading-[18px] [&_button]:whitespace-nowrap",
  "[&_button[aria-pressed=true]]:bg-secondary [&_button[aria-pressed=true]]:text-foreground [&_button[aria-pressed=true]]:shadow-[var(--ds-segment-shadow)]",
  "pointer-hover:[&_button:hover:not([aria-pressed=true]):not(:disabled)]:text-foreground max-[381px]:[&_button]:min-w-0 max-[381px]:[&_button]:px-[9px]",
].join(" ");

export type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  titles?: Partial<Record<T, string>>;
  disabled?: boolean;
  className?: string;
};

/** A named group of native toggle buttons. Tab and Enter/Space retain native behavior. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, titles, disabled, className }: SegmentedControlProps<T>) {
  return (
    <div className={cn(segmentedControlClassName, className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" title={titles?.[option]} disabled={disabled} aria-pressed={option === value} onClick={() => onChange(option)}>
          {titles?.[option] ?? option}
        </button>
      ))}
    </div>
  );
}
