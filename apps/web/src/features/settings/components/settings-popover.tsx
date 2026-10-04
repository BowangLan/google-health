import { cn } from "@/lib/utils";
import { fieldClassName, formClassName, segmentedClassName } from "@/components/forms/form-styles";
import { Button } from "@/components/button";
import { useState } from "react";
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
  const first = overview?.collections.find((collection) => !collection.error);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
    }
  }

  const rows: [string, string][] = first
    ? [
      ["Config", first.source ?? "defaults"],
      ["Food", overview!.collections[0]?.directory ?? "Not configured"],
      ["Weight", overview!.collections[1]?.directory ?? "Not configured"],
      ["Timezone", first.timezone],
      ["CLI unit", first.weight_unit],
    ]
    : [];

  return (
    <div className={cn(
      "popover p-5.5 grid gap-4.5 [&_.fields]:p-0 [&_h3]:text-[13px] [&_.line]:flex [&_.line]:flex-wrap",
      "[&_.line]:justify-between [&_.line]:gap-y-1.5 [&_.line]:gap-x-3 [&_.line]:text-muted-foreground",
      "[&_.line]:text-[12px] [&_.line]:wrap-anywhere [&_.line]:mt-2 [&_hr]:w-full [&_hr]:border-0 [&_hr]:border-t",
      "[&_hr]:[border-top-style:solid] [&_hr]:border-t-border max-[761px]:p-4.5"
    )}>
      <h3>Targets</h3>
      <form className={formClassName} onSubmit={submit}>
        <label className={fieldClassName}>
          <span>Daily calorie target</span>
          <input
            type="number"
            step="any"
            value={kcal}
            onChange={(event) => setKcal(event.target.value)}
          />
          <span className="hint">The dotted goal line on the calorie chart. Leave blank for none.</span>
        </label>
        <label className={fieldClassName}>
          <span>Daily protein target (g)</span>
          <input
            type="number"
            step="any"
            value={protein}
            onChange={(event) => setProtein(event.target.value)}
          />
        </label>
        <label className={fieldClassName}>
          <span>Daily deficit goal (kcal)</span>
          <input
            type="number"
            step="any"
            min="0"
            value={deficit}
            onChange={(event) => setDeficit(event.target.value)}
          />
          <span className="hint">
            How far under calories burned to stay. Today’s budget is burned
            minus eaten minus this. 0 aims to match what you burn.
          </span>
        </label>
        <div className={fieldClassName}>
          <span>Show weight in</span>
          <div className={segmentedClassName}>
            {(
              [
                ["", `follow the CLI (${first?.weight_unit ?? "kg"})`],
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
            Display only. Files keep kilograms and Google Health stores grams;
            nothing is converted on disk.
          </span>
        </div>
        {problem && <div className="consequence bg-warning-muted text-warning text-[12px] leading-[1.65] py-3 px-3.5 rounded-[14px] [&.calm]:bg-popover [&.calm]:text-muted-foreground">{problem}</div>}
        <div className="buttons flex items-center gap-2 [padding:8px_22px_20px] [&_.primary]:[flex:1]">
          <Button variant="primary" type="submit">
            Save targets
          </Button>
        </div>
      </form>
      <hr />
      <h3>Paths</h3>
      {rows.map(([term, value]) => (
        <div className="line" key={term}>
          <span>{term}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}
