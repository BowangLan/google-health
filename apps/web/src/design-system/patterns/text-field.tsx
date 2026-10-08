import { useId } from "react";
import { Input, type InputProps } from "@/design-system/primitives/input";
import { Field } from "@/design-system/patterns/field";

export type TextFieldProps = Omit<InputProps, "onChange" | "value"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
};

export function TextField({ label, value, onChange, type = "text", hint, error, id, "aria-describedby": describedBy, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} hintId={hintId} errorId={errorId}>
      <Input
        step={type === "number" ? "any" : undefined}
        {...props}
        id={inputId}
        type={type}
        value={value}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={[describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
