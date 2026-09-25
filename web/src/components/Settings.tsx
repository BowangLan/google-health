import { useState } from "react";
import * as api from "../lib/api";
import type { Overview, Targets } from "../lib/types";

export function SettingsPopover({ overview, targets, onSaved }: {
  overview: Overview | null;
  targets: Targets;
  onSaved: (targets: Targets) => void;
}) {
  const [kcal, setKcal] = useState(targets.daily_kcal === null ? "" : String(targets.daily_kcal));
  const [protein, setProtein] = useState(
    targets.daily_protein_g === null ? "" : String(targets.daily_protein_g),
  );
  const [unit, setUnit] = useState<"kg" | "lb" | "">(targets.weight_unit ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const first = overview?.collections.find((collection) => !collection.error);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      onSaved(await api.putTargets({
        daily_kcal: kcal.trim(),
        daily_protein_g: protein.trim(),
        weight_unit: unit || null,
      }));
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const rows: [string, string][] = first
    ? [
        ["Config", first.source ?? "defaults"],
        ["Food", overview!.collections[0]?.directory ?? "—"],
        ["Weight", overview!.collections[1]?.directory ?? "—"],
        ["Timezone", first.timezone],
        ["CLI unit", first.weight_unit],
      ]
    : [];

  return (
    <div className="popover">
      <h3>Targets</h3>
      <form className="fields" onSubmit={submit}>
        <label className="field">
          <span>Daily calorie target</span>
          <input type="number" step="any" value={kcal} onChange={(event) => setKcal(event.target.value)} />
          <span className="hint">drives the bars; leave blank for none</span>
        </label>
        <label className="field">
          <span>Daily protein target (g)</span>
          <input type="number" step="any" value={protein} onChange={(event) => setProtein(event.target.value)} />
        </label>
        <div className="field">
          <span>Show weight in</span>
          <div className="seg">
            {([["", `follow the CLI (${first?.weight_unit ?? "kg"})`], ["kg", "kg"], ["lb", "lb"]] as const)
              .map(([value, label]) => (
                <button key={value} type="button" aria-pressed={unit === value}
                  onClick={() => setUnit(value as "kg" | "lb" | "")}>
                  {label}
                </button>
              ))}
          </div>
          <span className="hint">
            Display only. Files keep kilograms and Google Health stores grams;
            nothing is converted on disk.
          </span>
        </div>
        {problem && <div className="consequence">{problem}</div>}
        <div className="buttons">
          <button className="primary" type="submit">Save targets</button>
        </div>
      </form>
      <hr />
      <h3>Paths</h3>
      {rows.map(([term, value]) => (
        <div className="line" key={term}><span>{term}</span><span>{value}</span></div>
      ))}
    </div>
  );
}
