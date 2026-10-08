import { formClassName } from "@/design-system/patterns/form-styles";
import { cn } from "@/design-system/lib/cn";
import { Button } from "@/design-system/primitives/button";
import { useState } from "react";
import { parseDay } from "@/lib/format";
import type { RunCommand } from "@/lib/types";
import { TextField } from "@/design-system/patterns/text-field";
import { UnitPicker } from "@/features/journal/components/unit-picker";

export function WeightComposer({
  day,
  today,
  unit,
  run,
  onLogged,
  onClose,
}: {
  day: string;
  today: string;
  unit: "kg" | "lb";
  run: RunCommand;
  onLogged: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [chosen, setChosen] = useState(unit);
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (
      !value.trim() ||
      !Number.isFinite(Number(value)) ||
      Number(value) <= 0
    ) {
      setError("Enter a weight greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const values: Record<string, string | boolean> = {
        value,
        unit: chosen,
        at,
        remote_note: note.trim(),
      };
      values.date = day;
      const result = await run("weight", "add", values);
      if (result.ok) onLogged();
      else setError(result.text || "Weight could not be logged.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <p className="record-date text-muted-foreground px-6 pt-5 text-ui-label max-[761px]:px-5">
        Logging for{" "}
        {parseDay(day).toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <form className={cn(formClassName, "gap-5 [&_input]:min-h-11")} onSubmit={submit}>
        <fieldset disabled={saving} className="grid gap-5 border-0 p-0 m-0 min-w-0">
          <section className="grid gap-4 rounded-2xl border border-solid border-border bg-popover p-4" aria-label="Weight reading">
            <div className="[&_input]:text-[32px] [&_input]:font-semibold [&_input]:tracking-tight [&_input]:py-3 [&_input]:min-h-18">
              <TextField
                label="Weight"
                type="number"
                value={value}
                onChange={setValue}
                placeholder={chosen === "lb" ? "180.0" : "80.0"}
                autoFocus
                required
              />
            </div>
            <UnitPicker value={chosen} onChange={setChosen} />
          </section>
          <div className="grid gap-2">
            <TextField label="Time" type="time" value={at} onChange={setAt} />
            <p className="text-ui-label text-subtle leading-5">
              {day === today ? "Leave blank for the current Pacific time."
                : "Leave blank to use noon as a placeholder."}
            </p>
          </div>
          <details className="border-t border-solid border-border pt-2 [&_summary]:min-h-11 [&_summary]:py-3 [&_summary]:leading-5">
            <summary>Add a note</summary>
            <div className="grid gap-2 pt-2">
              <TextField label="Note sent to Google" value={note} onChange={setNote} />
              <p className="text-ui-label text-subtle">This note is saved with the reading in Google Health.</p>
            </div>
          </details>
        </fieldset>
        {error && (
          <div className="consequence bg-warning-muted text-warning text-ui-label leading-[1.65] py-3 px-3.5 rounded-notice [&.calm]:bg-popover [&.calm]:text-muted-foreground" role="alert">
            {error}
          </div>
        )}
        <div className="buttons flex items-center gap-2 pt-2 [&_.primary]:flex-1 [&_button]:min-h-11">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Logging…" : "Log weight"}
          </Button>
        </div>
      </form>
    </>
  );
}
