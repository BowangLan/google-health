import { formClassName } from "@/components/forms/form-styles";
import { Button } from "@/components/button";
import { useState } from "react";
import { parseDay } from "@/lib/format";
import type { RunCommand } from "@/lib/types";
import { TextField } from "@/components/forms/text-field";
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
      <p className="record-date text-muted-foreground bg-popover py-[11px] px-5.5 border-b [border-bottom-style:solid] border-b-border text-[12px] max-[761px]:py-[11px] max-[761px]:px-4.5">
        Logging for{" "}
        {parseDay(day).toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <form className={formClassName} onSubmit={submit}>
        <div className="row2 grid gap-3 grid-cols-[repeat(2,_minmax(0,_1fr))]">
          <TextField
            label="Weight"
            type="number"
            value={value}
            onChange={setValue}
            autoFocus
          />
          <UnitPicker value={chosen} onChange={setChosen} />
        </div>
        <TextField
          label="Time"
          type="time"
          value={at}
          onChange={setAt}
          hint={
            day === today
              ? "Leave blank for the current time."
              : "Leave blank to use noon as a placeholder."
          }
        />
        <TextField
          label="Note sent to Google"
          value={note}
          onChange={setNote}
        />
        {error && (
          <div className="consequence bg-warning-muted text-warning text-[12px] leading-[1.65] py-3 px-3.5 rounded-[14px] [&.calm]:bg-popover [&.calm]:text-muted-foreground" role="alert">
            {error}
          </div>
        )}
        <div className="buttons flex items-center gap-2 [padding:8px_22px_20px] [&_.primary]:[flex:1]">
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Logging…" : "Log weight"}
          </Button>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
