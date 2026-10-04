import { cn } from "@/lib/utils";
import { Field } from "@/components/forms/field";
import { numberInputClassName } from "@/components/forms/form-styles";

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
        className={cn(
          type === "number" && numberInputClassName,
          scaled && "text-protein",
        )}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
