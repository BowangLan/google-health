import { fieldClassName, segmentedClassName } from "@/components/forms/form-styles";

export function UnitPicker({
  value,
  onChange,
}: {
  value: "kg" | "lb";
  onChange: (value: "kg" | "lb") => void;
}) {
  return (
    <div className={fieldClassName}>
      <span>Unit</span>
      <div className={segmentedClassName}>
        {(["kg", "lb"] as const).map((unit) => (
          <button
            key={unit}
            type="button"
            aria-pressed={unit === value}
            onClick={() => onChange(unit)}
          >
            {unit}
          </button>
        ))}
      </div>
    </div>
  );
}
