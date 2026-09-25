import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { guessMeal, num, parseDay } from "../lib/format";
import type { FoodMatch } from "../lib/types";
import { MealPicker, TextField } from "./fields";
import { IconAdd, IconClose } from "../lib/icons";

interface Draft {
  meal: string; name: string; kcal: string; amount: string; unit: string;
  protein: string; carbs: string; fat: string;
  sugar: string; fiber: string; sodium_mg: string; at: string; note: string;
}

const blank = (meal: string, name = ""): Draft => ({
  meal, name, kcal: "", amount: "1", unit: "serving",
  protein: "", carbs: "", fat: "", sugar: "", fiber: "", sodium_mg: "", at: "", note: "",
});

const text = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const scale = (value: number | null | undefined, factor: number) =>
  value === null || value === undefined ? "" : String(Number((value * factor).toFixed(3)));

/**
 * Searching past foods is the first step of adding one, not a separate place.
 * Choosing a past food logs it with `clone`, which rescales its nutrition and
 * keeps any Google catalog reference; anything typed fresh, or a past food
 * whose numbers were overridden, is logged with `add`.
 */
export function Composer({ day, isToday, onClose, onLogged, run }: {
  day: string;
  isToday: boolean;
  onClose: () => void;
  onLogged: (name: string) => void;
  run: (collection: "food", command: string, values: Record<string, string | boolean>) => Promise<{ ok: boolean; text: string }>;
}) {
  const [keyword, setKeyword] = useState("");
  const [matches, setMatches] = useState<FoodMatch[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<FoodMatch | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => { search.current?.focus(); }, []);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        const found = await api.searchFoods(keyword.trim());
        if (live) { setMatches(found.matches); setActive(0); }
      } catch { /* the list simply stays as it was */ }
    }, 150);
    return () => { live = false; window.clearTimeout(timer); };
  }, [keyword]);

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  function choose(match: FoodMatch) {
    setPicked(match);
    setDraft({
      ...blank(match.meal || guessMeal(isToday), match.name),
      kcal: text(match.kcal), amount: text(match.amount), unit: match.unit,
      protein: text(match.protein), carbs: text(match.carbs), fat: text(match.fat),
    });
  }

  function startNew() {
    setPicked(null);
    setDraft(blank(guessMeal(isToday), keyword.trim()));
  }

  // Mirror clone's rescaling live, so the numbers on screen are the numbers
  // that get written.
  function setAmount(value: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, amount: value };
      if (!picked) return next;
      const factor = Number(value) / Number(picked.amount || 1);
      if (!Number.isFinite(factor) || factor <= 0) return next;
      next.kcal = scale(picked.kcal, factor);
      next.protein = scale(picked.protein, factor);
      next.carbs = scale(picked.carbs, factor);
      next.fat = scale(picked.fat, factor);
      return next;
    });
  }

  /** True once a nutrient no longer matches the source scaled by the amount. */
  function overridden(): boolean {
    if (!picked || !draft) return true;
    const factor = Number(draft.amount) / Number(picked.amount || 1);
    const pairs: [string, number | null][] = [
      [draft.kcal, picked.kcal], [draft.protein, picked.protein],
      [draft.carbs, picked.carbs], [draft.fat, picked.fat],
    ];
    for (const [shown, original] of pairs) {
      if (original === null || original === undefined) {
        if (shown) return true;
        continue;
      }
      if (Number(shown) !== Number((original * factor).toFixed(3))) return true;
    }
    return draft.name !== picked.name;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !draft.name.trim() || !draft.kcal.trim()) return;
    setSaving(true);

    let outcome: { ok: boolean; text: string };
    if (picked && !overridden()) {
      // Re-resolve the position: clone addresses its source by index within a
      // keyword search, which another log could have shifted.
      const found = await api.searchFoods(picked.name);
      const match = found.matches.find((row) => row.name === picked.name);
      outcome = match
        ? await run("food", "clone", {
            keyword: picked.name, index: String(match.index), amount: draft.amount,
          })
        : { ok: false, text: "that food is no longer in the local files" };
    } else {
      const values: Record<string, string | boolean> = {
        meal: draft.meal.toLowerCase(), name: draft.name, kcal: draft.kcal,
        protein: draft.protein, carbs: draft.carbs, fat: draft.fat,
        sugar: draft.sugar, fiber: draft.fiber, sodium_mg: draft.sodium_mg,
        amount: draft.amount, unit: draft.unit, at: draft.at, note: draft.note,
      };
      if (!isToday) values.date = day;
      outcome = await run("food", "add", values);
    }

    setSaving(false);
    if (outcome.ok) onLogged(draft.name);
  }

  function onSearchKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) => Math.max(0, Math.min(matches.length, at + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const match = matches[active];
      if (match) choose(match); else startNew();
    }
  }

  return (
    <div className="composer">
      <div className="composer-head">
        <strong>Log food</strong>
        <span className="when">
          {parseDay(day).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <button className="icon" type="button" aria-label="Close" title="Close" onClick={onClose}>
            <IconClose aria-hidden focusable="false" />
          </button>
        </span>
      </div>

      <div className="fields">
        <label className="field">
          <span>What did you eat?</span>
          <input
            ref={search}
            type="text"
            value={keyword}
            placeholder="Search or type a new food"
            onChange={(event) => { setKeyword(event.target.value); setPicked(null); }}
            onKeyDown={onSearchKey}
          />
        </label>
      </div>

      <div className="results">
        {!keyword && matches.length > 0 && (
          <div className="section-head"><span>Recent</span></div>
        )}
        {matches.map((match, index) => (
          <button
            key={match.path}
            type="button"
            className={`result${index === active ? " active" : ""}`}
            onClick={() => choose(match)}
          >
            <span className="result-name">{match.name}</span>
            <span className="result-kcal">{num(match.kcal)}</span>
            <span className="result-when">{match.day.slice(5)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`result newfood${active === matches.length ? " active" : ""}`}
          onClick={startNew}
        >
          <span className="result-name">
            <IconAdd size={14} aria-hidden focusable="false" />
            {keyword ? ` New food “${keyword.trim()}”` : " New food"}
          </span>
        </button>
      </div>

      {draft && (
        <form className="fields" onSubmit={submit}>
          <MealPicker value={draft.meal} onChange={set("meal")} />
          <TextField label="Name" value={draft.name} onChange={set("name")} />
          <div className="row3">
            <TextField label="Calories" type="number" value={draft.kcal} onChange={set("kcal")} scaled={Boolean(picked)} autoFocus />
            <TextField label="Amount" type="number" value={draft.amount} onChange={setAmount} />
            <TextField label="Unit" value={draft.unit} onChange={set("unit")} />
          </div>
          <div className="row3">
            <TextField label="Protein" type="number" value={draft.protein} onChange={set("protein")} scaled={Boolean(picked)} />
            <TextField label="Carbs" type="number" value={draft.carbs} onChange={set("carbs")} scaled={Boolean(picked)} />
            <TextField label="Fat" type="number" value={draft.fat} onChange={set("fat")} scaled={Boolean(picked)} />
          </div>
          <details>
            <summary>Sugar, fibre, sodium, time, note</summary>
            <div className="fields">
              <div className="row3">
                <TextField label="Sugar" type="number" value={draft.sugar} onChange={set("sugar")} />
                <TextField label="Fibre" type="number" value={draft.fiber} onChange={set("fiber")} />
                <TextField label="Sodium mg" type="number" value={draft.sodium_mg} onChange={set("sodium_mg")} />
              </div>
              <TextField label="Time" type="time" value={draft.at} onChange={set("at")} />
              <TextField label="Private note" value={draft.note} onChange={set("note")} hint="stays on this Mac" />
            </div>
          </details>
          <div className={`consequence calm`}>
            {picked
              ? `From ${picked.day}. Calories and every nutrient scale with the amount.`
              : "Totals for the portion you ate. The amount does not multiply them."}
          </div>
          <div className="buttons">
            <button className="primary" type="submit" disabled={saving}>Log</button>
            <button className="secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
