import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { num, parseDay } from "../lib/format";
import type { FoodMatch, FoodRow } from "../lib/types";
import { MealPicker, TextField } from "./fields";
import { IconAdd } from "../lib/icons";

interface Draft {
  meal: string;
  name: string;
  kcal: string;
  amount: string;
  unit: string;
  protein: string;
  carbs: string;
  fat: string;
  sugar: string;
  fiber: string;
  sodium_mg: string;
  at: string;
  note: string;
}

const blank = (meal: string, name = ""): Draft => ({
  meal,
  name,
  kcal: "",
  amount: "1",
  unit: "serving",
  protein: "",
  carbs: "",
  fat: "",
  sugar: "",
  fiber: "",
  sodium_mg: "",
  at: "",
  note: "",
});

const text = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const scale = (value: number | null | undefined, factor: number) =>
  value === null || value === undefined
    ? ""
    : String(Number((value * factor).toFixed(3)));

function fromFood(match: FoodRow): Draft {
  return {
    ...blank(match.meal || "ANYTIME", match.name),
    kcal: text(match.kcal),
    amount: text(match.amount),
    unit: match.unit,
    protein: text(match.protein),
    carbs: text(match.carbs),
    fat: text(match.fat),
    sugar: text(match.sugar),
    fiber: text(match.fiber),
    sodium_mg: text(match.sodium_mg),
  };
}

/**
 * Searching past foods is the first step of adding one, not a separate place.
 * Choosing a past food logs it with `clone`, which rescales its nutrition and
 * keeps any Google catalog reference; anything typed fresh, or a past food
 * whose numbers were overridden, is logged with `add`.
 */
export function Composer({
  day,
  isToday,
  onClose,
  onLogged,
  run,
  source,
}: {
  source?: FoodRow;
  day: string;
  isToday: boolean;
  onClose: () => void;
  onLogged: (name: string) => void;
  run: (
    collection: "food",
    command: string,
    values: Record<string, string | boolean>,
  ) => Promise<{ ok: boolean; text: string }>;
}) {
  const [keyword, setKeyword] = useState("");
  const [matches, setMatches] = useState<FoodMatch[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<FoodRow | null>(source ?? null);
  const [draft, setDraft] = useState<Draft | null>(() =>
    source ? fromFood(source) : null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [searchProblem, setSearchProblem] = useState(false);
  const [saving, setSaving] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    search.current?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        const found = await api.searchFoods(keyword.trim());
        if (live) {
          setMatches(found.matches);
          setActive(0);
          setSearchProblem(false);
        }
      } catch {
        if (live) {
          setMatches([]);
          setSearchProblem(true);
        }
      }
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [keyword]);

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  function choose(match: FoodMatch) {
    setProblem(null);
    setPicked(match);
    setDraft(fromFood(match));
  }

  function startNew() {
    setProblem(null);
    setPicked(null);
    setDraft(blank("ANYTIME", keyword.trim()));
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
      next.sugar = scale(picked.sugar, factor);
      next.fiber = scale(picked.fiber, factor);
      next.sodium_mg = scale(picked.sodium_mg, factor);
      return next;
    });
  }

  /** True once a nutrient no longer matches the source scaled by the amount. */
  function overridden(): boolean {
    if (!picked || !draft) return true;
    const factor = Number(draft.amount) / Number(picked.amount || 1);
    const pairs: [string, number | null][] = [
      [draft.kcal, picked.kcal],
      [draft.protein, picked.protein],
      [draft.carbs, picked.carbs],
      [draft.fat, picked.fat],
      [draft.sugar, picked.sugar],
      [draft.fiber, picked.fiber],
      [draft.sodium_mg, picked.sodium_mg],
    ];
    for (const [shown, original] of pairs) {
      if (original === null || original === undefined) {
        if (shown) return true;
        continue;
      }
      if (Number(shown) !== Number((original * factor).toFixed(3))) return true;
    }
    return draft.name !== picked.name || draft.unit !== picked.unit;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    if (
      !draft.name.trim() ||
      !draft.kcal.trim() ||
      !draft.protein.trim() ||
      !draft.carbs.trim() ||
      !draft.fat.trim()
    ) {
      setProblem(
        "Add a name, calories, protein, carbs, and fat. Use 0 where appropriate.",
      );
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      const values: Record<string, string | boolean> = {
        meal: draft.meal.toLowerCase(),
        name: draft.name,
        kcal: draft.kcal,
        protein: draft.protein,
        carbs: draft.carbs,
        fat: draft.fat,
        sugar: draft.sugar,
        fiber: draft.fiber,
        sodium_mg: draft.sodium_mg,
        amount: draft.amount,
        unit: draft.unit,
        at: draft.at,
        note: draft.note,
        date: day,
      };
      let cloneIndex: number | null = null;
      if (
        picked &&
        isToday &&
        !overridden() &&
        draft.meal === picked.meal &&
        !draft.at &&
        !draft.note
      ) {
        // Clone only if its current source still matches the displayed draft
        // and the server still considers the destination today.
        const [found, current] = await Promise.all([
          api.searchFoods(picked.name),
          api.getMonth(),
        ]);
        const match = found.matches.find((row) => row.path === picked.path);
        const keys = [
          "name",
          "amount",
          "unit",
          "meal",
          "kcal",
          "protein",
          "carbs",
          "fat",
          "sugar",
          "fiber",
          "sodium_mg",
        ] as const;
        if (
          current.today === day &&
          match &&
          keys.every((key) => match[key] === picked[key])
        )
          cloneIndex = match.index;
      }
      const outcome =
        cloneIndex !== null && picked
          ? await run("food", "clone", {
              keyword: picked.name,
              index: String(cloneIndex),
              amount: draft.amount,
            })
          : await run("food", "add", values);

      if (outcome.ok) onLogged(draft.name);
      else
        setProblem(
          outcome.text || "This food could not be logged. Please try again.",
        );
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  function onSearchKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) =>
        Math.max(
          0,
          Math.min(matches.length, at + (event.key === "ArrowDown" ? 1 : -1)),
        ),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const match = matches[active];
      if (match) choose(match);
      else startNew();
    }
  }

  return (
    <div className="composer">
      <p className="record-date">
        Logging for{" "}
        {parseDay(day).toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      {!draft && (
        <>
          <div className="fields">
            <label className="field">
              <span>What did you eat?</span>
              <input
                ref={search}
                autoFocus
                type="text"
                value={keyword}
                placeholder="Search or type a new food"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPicked(null);
                }}
                onKeyDown={onSearchKey}
              />
            </label>
          </div>

          {searchProblem && (
            <p className="search-error" role="status">
              Past foods couldn’t be loaded. You can still enter a new food.
            </p>
          )}
          <div className="results">
            {!keyword && matches.length > 0 && (
              <div className="section-head">
                <span>Recent</span>
              </div>
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
        </>
      )}
      {draft && (
        <form className="fields" onSubmit={submit}>
          <button
            type="button"
            className="back-to-search"
            onClick={() => {
              setDraft(null);
              setProblem(null);
            }}
          >
            Back to food search
          </button>
          <MealPicker value={draft.meal} onChange={set("meal")} />
          <TextField
            label="Name"
            value={draft.name}
            onChange={set("name")}
            autoFocus={!draft.name}
          />
          <div className="row3">
            <TextField
              label="Calories"
              type="number"
              value={draft.kcal}
              onChange={set("kcal")}
              scaled={Boolean(picked)}
              autoFocus={Boolean(draft.name)}
            />
            <TextField
              label="Amount"
              type="number"
              value={draft.amount}
              onChange={setAmount}
            />
            <TextField label="Unit" value={draft.unit} onChange={set("unit")} />
          </div>
          <div className="row3">
            <TextField
              label="Protein"
              type="number"
              value={draft.protein}
              onChange={set("protein")}
              scaled={Boolean(picked)}
            />
            <TextField
              label="Carbs"
              type="number"
              value={draft.carbs}
              onChange={set("carbs")}
              scaled={Boolean(picked)}
            />
            <TextField
              label="Fat"
              type="number"
              value={draft.fat}
              onChange={set("fat")}
              scaled={Boolean(picked)}
            />
          </div>
          <details>
            <summary>Sugar, fibre, sodium, time, note</summary>
            <div className="fields">
              <div className="row3">
                <TextField
                  label="Sugar"
                  type="number"
                  value={draft.sugar}
                  onChange={set("sugar")}
                />
                <TextField
                  label="Fibre"
                  type="number"
                  value={draft.fiber}
                  onChange={set("fiber")}
                />
                <TextField
                  label="Sodium mg"
                  type="number"
                  value={draft.sodium_mg}
                  onChange={set("sodium_mg")}
                />
              </div>
              <TextField
                label="Time"
                type="time"
                value={draft.at}
                onChange={set("at")}
              />
              <TextField
                label="Private note"
                value={draft.note}
                onChange={set("note")}
                hint="stays on this Mac"
              />
            </div>
          </details>
          <div className={`consequence calm`}>
            {picked
              ? `From ${picked.day}. Calories and every nutrient scale with the amount.`
              : "Totals for the portion you ate. The amount does not multiply them."}
          </div>
          {problem && (
            <div className="consequence" role="alert">
              {problem}
            </div>
          )}
          <div className="buttons">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Logging…" : "Log food"}
            </button>
            <button className="secondary" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
