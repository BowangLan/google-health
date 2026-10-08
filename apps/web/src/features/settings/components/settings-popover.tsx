import { cn } from "@/design-system/lib/cn";
import { fieldClassName, formClassName, numberInputClassName, segmentedClassName } from "@/design-system/patterns/form-styles";
import { Button } from "@/design-system/primitives/button";
import { useRef, useState } from "react";
import * as api from "@/lib/api";
import type { Overview, Targets } from "@/lib/types";

export function SettingsPopover({
  overview,
  targets,
  onSaved,
}: {
  overview: Overview | null;
  targets: Targets;
  onSaved: (targets: Targets) => void;
}) {
  const [kcal, setKcal] = useState(
    targets.daily_kcal === null ? "" : String(targets.daily_kcal),
  );
  const [protein, setProtein] = useState(
    targets.daily_protein_g === null ? "" : String(targets.daily_protein_g),
  );
  const [deficit, setDeficit] = useState(String(targets.daily_deficit_kcal ?? 0));
  const [unit, setUnit] = useState<"kg" | "lb" | "">(targets.weight_unit ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const first = overview?.collections.find((collection) => !collection.error);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    for (const [label, value] of [
      ["Daily calorie target", kcal],
      ["Daily protein target", protein],
    ] as const) {
      if (!value.trim()) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0 || number > 100000) {
        setProblem(`${label} must be greater than 0 and no more than 100,000. Leave it blank for no target.`);
        return;
      }
    }
    const deficitNumber = deficit.trim() ? Number(deficit) : 0;
    if (!Number.isFinite(deficitNumber) || deficitNumber < 0 || deficitNumber > 5000) {
      setProblem("Daily deficit goal must be between 0 and 5,000 kcal.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setProblem(null);
    try {
      onSaved(
        await api.putTargets({
          daily_kcal: kcal.trim(),
          daily_protein_g: protein.trim(),
          daily_deficit_kcal: deficit.trim(),
          weight_unit: unit || null,
        }),
      );
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const rows: [string, string][] = first
    ? [
      ["Config", first.source ?? "defaults"],
      ["Food", overview!.collections.find((collection) => collection.kind === "food")?.directory ?? "Not configured"],
      ["Weight", overview!.collections.find((collection) => collection.kind === "weight")?.directory ?? "Not configured"],
      ["Timezone", first.timezone],
      ["CLI unit", first.weight_unit],
    ]
    : [];

  return (
    <div className={cn(
      "popover p-6 grid gap-6 [&_.fields]:p-0 [&_h3]:text-ui-subheading [&_h3]:font-semibold",
      "[&_.line]:grid [&_.line]:grid-cols-[64px_minmax(0,1fr)] [&_.line]:items-baseline [&_.line]:gap-3 [&_.line]:text-muted-foreground",
      "[&_.line]:text-ui-detail [&_.line]:leading-[1.6] [&_.line_span:last-child]:text-right [&_.line_span:last-child]:wrap-anywhere [&_.line_span:last-child]:[font-family:var(--ds-font-code)] [&_hr]:w-full [&_hr]:border-0 [&_hr]:border-t",
      "[&_hr]:[border-top-style:solid] [&_hr]:border-t-border max-[761px]:p-5"
    )}>
      <div className="grid gap-1.5">
        <h3>Your daily targets</h3>
        <p className="text-ui-body leading-5 text-muted-foreground">Set the goals you want to see in your journal and charts.</p>
      </div>
      <form className={formClassName} onSubmit={submit} aria-busy={saving}>
        <fieldset disabled={saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
          <div className="grid grid-cols-2 gap-4 max-[421px]:grid-cols-1">
            <label className={fieldClassName}>
              <span>Daily calorie target</span>
              <input
                type="number"
                className={numberInputClassName}
                step="any"
                min="0"
                max="100000"
                placeholder="No target"
                value={kcal}
                onChange={(event) => setKcal(event.target.value)}
              />
              <span className="hint">Shown as a goal on your calorie chart. Optional.</span>
            </label>
            <label className={fieldClassName}>
              <span>Daily protein target (g)</span>
              <input
                type="number"
                className={numberInputClassName}
                step="any"
                min="0"
                max="100000"
                placeholder="No target"
                value={protein}
                onChange={(event) => setProtein(event.target.value)}
              />
              <span className="hint">Your daily protein goal. Optional.</span>
            </label>
          </div>
          <label className={fieldClassName}>
            <span>Daily deficit goal (kcal)</span>
            <input
              type="number"
              className={numberInputClassName}
              step="any"
              min="0"
              max="5000"
              value={deficit}
              onChange={(event) => setDeficit(event.target.value)}
            />
            <span className="hint">
              Subtracted from calories burned to calculate how much you have left to eat. Set 0 to match what you burn.
            </span>
          </label>
          <div className={cn(fieldClassName, "border-t border-solid border-border pt-5")}>
            <span>Show weight in</span>
            <div className={cn(segmentedClassName, "[&_button:first-child]:[flex:2.5]")}>
              {(
                [
                  ["", `Default (${first?.weight_unit ?? "kg"})`],
                  ["kg", "kg"],
                  ["lb", "lb"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={unit === value}
                  onClick={() => setUnit(value as "kg" | "lb" | "")}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="hint">
              Changes how weight appears in the app. Your measurements stay the same.
            </span>
          </div>
        </fieldset>
        {problem && <div role="alert" className="consequence bg-warning-muted text-warning text-ui-body leading-[1.65] py-3 px-3.5 rounded-notice">{problem}</div>}
        <div className="buttons flex items-center gap-2 pt-1 [&_.primary]:[flex:1]">
          <Button variant="primary" type="submit" disabled={saving} className="min-h-11">
            {saving ? "Saving…" : "Save targets"}
          </Button>
        </div>
      </form>
      <details className="border-t border-solid border-border pt-4 text-ui-label text-muted-foreground">
        <summary className="cursor-pointer py-1">Local configuration</summary>
        <div className="grid gap-2.5 pt-4">
          {rows.map(([term, value]) => (
            <div className="line" key={term}>
              <span>{term}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
