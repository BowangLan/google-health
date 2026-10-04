import { useState } from "react";
import * as api from "../lib/api";
import { clock } from "../lib/format";
import type { FoodRow, Kind, WeightRow } from "../lib/types";
import { MealPicker, TextField, UnitPicker } from "./fields";

const text = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

/** Everything that is a total for the portion, so everything the amount scales. */
const SCALES_WITH_AMOUNT = ["kcal", "protein", "carbs", "fat", "sugar", "fiber", "sodium_mg"];

/**
 * Editing writes the local file and nothing else. The consequence line appears
 * only once a field actually changes, and it says what the next push will do,
 * which differs for a synced food (replaced: created anew, old one deleted)
 * from anything not yet sent.
 */
export function EditRecord({ kind, record, onDone, onCancel }: {
  kind: Kind;
  record: FoodRow | WeightRow;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const food = kind === "food" ? (record as FoodRow) : null;
  const weight = kind === "weight" ? (record as WeightRow) : null;

  const [values, setValues] = useState<Record<string, string>>((): Record<string, string> => {
    if (food) {
      return {
        meal: food.meal, name: food.name, kcal: text(food.kcal),
        amount: text(food.amount), unit: food.unit,
        protein: text(food.protein), carbs: text(food.carbs), fat: text(food.fat),
        sugar: text(food.sugar), fiber: text(food.fiber), sodium_mg: text(food.sodium_mg),
        at: clock(food.time),
      };
    }
    return {
      value: text(weight!.value), unit: weight!.unit,
      at: clock(weight!.time), remote_note: weight!.remote_note,
    };
  });
  const [initial] = useState<Record<string, string>>(() => ({ ...values }));
  // Which figures the user typed themselves. Values that merely moved because
  // the amount changed are a preview: the server rescales the record, so
  // sending them back would scale twice.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const set = (key: string) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setTouched((current) => new Set(current).add(key));
    setDirty(true);
    setProblem(null);
  };

  /**
   * Changing the amount rescales the nutrition, matching what `food clone`
   * does: "I actually had two of these" should not mean retyping every macro.
   * Values scale from the amount the record was opened with, so typing 2 then
   * 3 gives three times the original rather than six.
   */
  const setAmount = (value: string) => {
    setDirty(true);
    setProblem(null);
    setTouched((current) => new Set(current).add("amount"));
    setValues((current) => {
      const next: Record<string, string> = { ...current, amount: value };
      const from = Number(initial.amount);
      const to = Number(value);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
        return next;
      }
      const factor = to / from;
      for (const key of SCALES_WITH_AMOUNT) {
        const base = initial[key];
        if (base === undefined || base === "") continue;
        const scaled = Number(base) * factor;
        if (!Number.isFinite(scaled)) continue;
        next[key] = String(Number(scaled.toFixed(3)));
      }
      return next;
    });
  };

  const rescaled = Boolean(food) && values.amount !== initial.amount;

  const consequence = record.state !== "synced"
    ? "Saves to the local file. It stays unpushed until you push."
    : kind === "food"
      ? "Saves to the local file. On your next push this replaces the record in Google Health: a new entry is created and the old one deleted."
      : "Saves to the local file. It stays edited until you push.";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    // Only what actually changed. A displayed weight is rounded for reading,
    // so resending an untouched value would convert it back with a little
    // drift and mark the record edited for nothing.
    const changed: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === initial[key]) continue;
      // A scaled figure the user did not type is the server's to compute.
      if (SCALES_WITH_AMOUNT.includes(key) && !touched.has(key)) continue;
      changed[key] = value;
    }
    if ("value" in changed && !("unit" in changed)) changed.unit = values.unit ?? "kg";
    try {
      const result = await api.patchRecord(kind, record.path, changed);
      onDone(result.changed ? "Saved locally. Push when you are ready." : "Nothing changed.");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  return (
    <form className="fields" onSubmit={submit}>
      {food ? (
        <>
          <MealPicker value={values.meal ?? "ANYTIME"} onChange={set("meal")} />
          <TextField
            label="Name"
            value={values.name ?? ""}
            onChange={set("name")}
            disabled={food.identified}
            hint={food.identified ? "Name comes from Google's catalog and cannot be changed here." : undefined}
          />
          <div className="row3">
            <TextField label="Calories" type="number" value={values.kcal ?? ""}
              onChange={set("kcal")} scaled={rescaled} />
            <TextField label="Amount" type="number" value={values.amount ?? ""} onChange={setAmount} />
            <TextField label="Unit" value={values.unit ?? ""} onChange={set("unit")} />
          </div>
          <div className="row3">
            <TextField label="Protein" type="number" value={values.protein ?? ""}
              onChange={set("protein")} scaled={rescaled} />
            <TextField label="Carbs" type="number" value={values.carbs ?? ""}
              onChange={set("carbs")} scaled={rescaled} />
            <TextField label="Fat" type="number" value={values.fat ?? ""}
              onChange={set("fat")} scaled={rescaled} />
          </div>
          <div className="row3">
            <TextField label="Sugar" type="number" value={values.sugar ?? ""}
              onChange={set("sugar")} scaled={rescaled} />
            <TextField label="Fibre" type="number" value={values.fiber ?? ""}
              onChange={set("fiber")} scaled={rescaled} />
            <TextField label="Sodium mg" type="number" value={values.sodium_mg ?? ""}
              onChange={set("sodium_mg")} scaled={rescaled} />
          </div>
          {rescaled && (
            <div className="consequence calm">
              Scaled from {initial.amount} to {values.amount} {values.unit || "serving"}.
              Every nutrient scales, including any not shown here. Type over a
              figure to override it.
            </div>
          )}
          <TextField label="Time" type="time" value={values.at ?? ""} onChange={set("at")} />
        </>
      ) : (
        <>
          <div className="row2">
            <TextField label="Weight" type="number" value={values.value ?? ""} onChange={set("value")} />
            <UnitPicker value={(values.unit as "kg" | "lb") ?? "kg"} onChange={set("unit")} />
          </div>
          <TextField label="Time" type="time" value={values.at ?? ""} onChange={set("at")} />
          <TextField label="Note sent to Google" value={values.remote_note ?? ""} onChange={set("remote_note")} />
        </>
      )}

      {problem && <div className="consequence">{problem}</div>}
      {!problem && dirty && (
        <div className={`consequence${record.state === "synced" && kind === "food" ? "" : " calm"}`}>
          {consequence}
        </div>
      )}
      <div className="buttons">
        <button className="primary" type="submit" disabled={saving || !dirty}>Save changes</button>
        <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** Deleting a synced record stages a remote deletion; the copy has to say so. */
export function DeleteConfirm({ kind, record, title, onDone, onCancel }: {
  kind: Kind;
  record: FoodRow | WeightRow;
  title: string;
  onDone: (message: string, staged: boolean) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const synced = record.state === "synced";

  async function remove() {
    setBusy(true);
    try {
      const result = await api.deleteRecord(kind, record.path);
      onDone(
        result.staged_remote_delete
          ? "Deleted locally. Push to remove it from Google Health."
          : "Deleted.",
        result.staged_remote_delete,
      );
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <div className="confirm">
      <div>
        {problem ?? (synced
          ? `Delete “${title}”? The local file goes now. Google Health keeps it until your next push, which will delete it there too.`
          : `Delete “${title}”? It was never sent to Google Health.`)}
      </div>
      <div className="buttons">
        {!problem && (
          <button className="secondary danger" type="button" disabled={busy} onClick={remove}>
            Delete
          </button>
        )}
        <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
