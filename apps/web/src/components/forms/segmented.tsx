import { fieldClassName, segmentedClassName } from "@/components/forms/form-styles";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  titles,
  className,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  titles?: Record<string, string>;
  className?: string;
}) {
  return (
    <div className={cn(fieldClassName, className)}>
      <span>{label}</span>
      <div className={segmentedClassName} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            title={titles?.[option]}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {titles ? titles[option] : option}
          </button>
        ))}
      </div>
    </div>
  );
}
