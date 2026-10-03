import type { ReactNode } from "react";
import { MEALS, MEAL_NAME } from "../lib/format";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  placeholder,
  disabled,
  scaled,
  autoFocus,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  scaled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        className={scaled ? "scaled" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

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
    <div className="field">
      <span>{label}</span>
      <div className="seg">
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

export function MealPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Segmented
      label="Meal"
      options={MEALS}
      value={value as (typeof MEALS)[number]}
      onChange={onChange}
      titles={MEAL_NAME}
    />
  );
}

export function UnitPicker({
  value,
  onChange,
}: {
  value: "kg" | "lb";
  onChange: (value: "kg" | "lb") => void;
}) {
  return (
    <div className="field">
      <span>Unit</span>
      <div className="seg">
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
