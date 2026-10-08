import type { ReactNode } from "react";
import { fieldClassName } from "@/design-system/patterns/form-styles";

export type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  hintId?: string;
  errorId?: string;
  children: ReactNode;
};

/** TextField connects these descriptions to its input. Group controls label themselves. */
export function Field({ label, hint, error, htmlFor, hintId, errorId, children }: FieldProps) {
  return (
    <label className={fieldClassName} htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
      {hint ? <span id={hintId} className="hint">{hint}</span> : null}
      {error ? <span id={errorId} className="text-ui-caption text-destructive leading-relaxed">{error}</span> : null}
    </label>
  );
}
