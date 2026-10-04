import { Field } from "@/components/forms/field";

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
        className={scaled ? "text-protein" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
