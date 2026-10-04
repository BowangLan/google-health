import { fieldClassName, segmentedClassName } from "@/components/forms/form-styles";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  titles,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  titles?: Record<string, string>;
}) {
  return (
    <div className={fieldClassName}>
      <span>{label}</span>
      <div className={segmentedClassName}>
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
