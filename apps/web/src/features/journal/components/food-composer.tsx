import { cn } from "@/design-system/lib/cn";
import { fieldClassName, formClassName } from "@/design-system/patterns/form-styles";
import { Button } from "@/design-system/primitives/button";
import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import { num, parseDay } from "@/lib/format";
import type { FoodMatch, FoodRow } from "@/lib/types";
import { MealPicker } from "@/features/journal/components/meal-picker";
import { TextField } from "@/design-system/patterns/text-field";
import { IconAdd } from "@/design-system/foundations/icons";

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
 * A past food can use `clone` when today's time is left implicit, retaining
 * its Google catalog reference. Explicit dates/times, fresh foods, and changed
 * nutrients use `add` with the displayed values.
 */
export function FoodComposer({
  day: selectedDay,
  today,
  onClose,
  onLogged,
  run,
  source,
}: {
  source?: FoodRow;
  day: string;
  today: string;
  onClose: () => void;
  onLogged: (name: string, day: string, at: string) => void;
  run: (
    collection: "food",
    command: string,
    values: Record<string, string | boolean>,
  ) => Promise<{ ok: boolean; text: string }>;
}) {
  const [day, setDay] = useState(selectedDay);
  const [at, setAt] = useState(() =>
    selectedDay === today ? new Date().toLocaleTimeString("en-GB", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }) : "",
  );
  const [keyword, setKeyword] = useState("");
  const [matches, setMatches] = useState<FoodMatch[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<FoodRow | null>(source ?? null);
  const [draft, setDraft] = useState<Draft | null>(() =>
    source ? fromFood(source) : null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [searchProblem, setSearchProblem] = useState(false);
  const [searching, setSearching] = useState(true);
  const [saving, setSaving] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    search.current?.focus();
  }, [Boolean(draft)]);

  useEffect(() => {
    let live = true;
    setSearching(true);
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
      } finally {
        if (live) setSearching(false);
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
    const nutrients = [draft.kcal, draft.protein, draft.carbs, draft.fat,
      draft.sugar, draft.fiber, draft.sodium_mg];
    if (nutrients.some((value) => value.trim() &&
      (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      setProblem("Calories and nutrients must be zero or greater.");
      return;
    }
    if (!draft.amount.trim() || !Number.isFinite(Number(draft.amount)) ||
      Number(draft.amount) <= 0 || !draft.unit.trim()) {
      setProblem("Enter an amount greater than zero and its unit.");
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
        at,
        note: draft.note,
        date: day,
      };
      let cloneIndex: number | null = null;
      if (
        picked &&
        day === today &&
        !overridden() &&
        draft.meal === picked.meal &&
        !at &&
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

      if (outcome.ok) onLogged(draft.name, day, at);
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
      if (searching) return;
      const match = matches[active];
      if (match) choose(match);
      else startNew();
    }
  }

  const dateFields = (
    <div className="composer-datetime grid gap-3 border-t border-solid border-border pt-4">
      <div className="row2 grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <TextField label="Date" type="date" value={day} onChange={setDay} disabled={saving} required />
        <TextField label="Time (Pacific)" type="time" value={at} onChange={setAt} disabled={saving} />
      </div>
      <p className="text-ui-label text-subtle leading-5">
        {day === today ? "Leave time blank to use the current Pacific time."
          : "Leave time blank to use noon as a placeholder."}
      </p>
    </div>
  );

  return (
    <form className="composer [&_input]:min-h-11" onSubmit={submit}>
      {!draft && (
        <div className={cn(formClassName, "gap-5")}>
          <div className="grid gap-2">
            <label className={fieldClassName}>
              <span>What did you eat?</span>
              <input
                ref={search}
                autoFocus
                type="text"
                value={keyword}
                placeholder="Search your foods or add a new one"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPicked(null);
                }}
                onKeyDown={onSearchKey}
              />
            </label>
            <p className="text-ui-label text-subtle leading-5">Choose a past food to use its nutrition and adjust your portion.</p>
          </div>

          {searchProblem && (
            <p className="search-error text-ui-label text-warning leading-5" role="status">
              Past foods couldn’t be loaded. You can still enter a new food.
            </p>
          )}
          <div className="results grid gap-1" aria-busy={searching}>
            <div className="section-head flex justify-between text-subtle text-ui-caption font-semibold pb-1">
              <span>{keyword ? "Matching foods" : "Recent foods"}</span>
              <span>kcal per portion</span>
            </div>
            <div className="max-h-[260px] overflow-y-auto overscroll-contain -mx-2 px-2">
              {matches.map((match, index) => (
                <button
                  key={match.path}
                  type="button"
                  disabled={searching}
                  className={cn(
                    "result flex items-center gap-3 w-full min-h-14 border border-solid border-transparent rounded-xl bg-transparent text-foreground p-3 text-left pointer-hover:hover:bg-popover",
                    index === active && "active bg-secondary border-input",
                  )}
                  onClick={() => choose(match)}
                >
                  <span className="result-name flex-1 min-w-0 text-ui-body font-medium wrap-anywhere">{match.name}</span>
                  <span className="result-kcal text-right tabular-nums font-semibold">{num(match.kcal)}</span>
                  <span className="result-when shrink-0 text-right text-subtle text-ui-caption tabular-nums">{match.day.slice(5)}</span>
                </button>
              ))}
            </div>
            {searching && <p className="text-ui-label text-subtle py-2" role="status">Finding your foods…</p>}
            {!searching && !matches.length && keyword && !searchProblem && (
              <p className="text-ui-label text-subtle py-3">No past foods match this search.</p>
            )}
            <button
              type="button"
              className={cn(
                "result newfood flex items-center gap-2 w-full min-h-11 rounded-xl border border-solid border-input bg-transparent text-foreground py-3 px-3 text-left text-ui-body pointer-hover:hover:bg-popover",
                active === matches.length && "active bg-secondary",
              )}
              onClick={startNew}
            >
              <IconAdd size={16} aria-hidden focusable="false" />
              <span>{keyword ? `New food “${keyword.trim()}”` : "New food"}</span>
            </button>
          </div>
          {dateFields}
        </div>
      )}
      {draft && (
        <>
          <fieldset disabled={saving} className={cn(formClassName, "border-0 m-0 min-w-0 gap-5")}>
            <div className="grid gap-3">
              <button
                type="button"
                className="back-to-search justify-self-start min-h-11 border-0 bg-transparent text-muted-foreground px-0 text-ui-label pointer-hover:hover:text-foreground"
                onClick={() => {
                  setDraft(null);
                  setProblem(null);
                }}
              >
                Back to food search
              </button>
              <TextField label="Name" value={draft.name} onChange={set("name")} autoFocus required />
              {picked && (
                <p className="text-ui-label text-subtle">Using nutrition from {parseDay(picked.day).toLocaleDateString([], { month: "short", day: "numeric" })}.</p>
              )}
            </div>

            <section className="grid gap-3 rounded-2xl border border-solid border-border bg-popover p-4" aria-label="Portion eaten">
              <div>
                <h3 className="text-ui-body font-semibold">Your portion</h3>
                <p className="text-ui-label text-muted-foreground mt-1 leading-5">
                  {picked ? "Changing the amount scales calories and every nutrient below."
                    : "Enter totals for what you ate. Changing the amount does not multiply them."}
                </p>
              </div>
              <div className="row2 grid grid-cols-2 gap-3">
                <TextField label="Amount" type="number" value={draft.amount} onChange={setAmount} required />
                <TextField label="Unit" value={draft.unit} onChange={set("unit")} required />
              </div>
            </section>

            <section className="grid gap-3" aria-label="Nutrition for your portion">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-ui-body font-semibold">Nutrition for your portion</h3>
                <span className="text-ui-caption text-subtle">Macros in grams</span>
              </div>
              <TextField label="Calories" type="number" value={draft.kcal} onChange={set("kcal")} className={picked ? "text-protein" : undefined} required />
              <div className="row3 grid grid-cols-3 gap-3 max-[381px]:gap-2">
                <TextField label="Protein" type="number" value={draft.protein} onChange={set("protein")} className={picked ? "text-protein" : undefined} required />
                <TextField label="Carbs" type="number" value={draft.carbs} onChange={set("carbs")} className={picked ? "text-protein" : undefined} required />
                <TextField label="Fat" type="number" value={draft.fat} onChange={set("fat")} className={picked ? "text-protein" : undefined} required />
              </div>
              <p className="text-ui-label text-subtle">Include all three macros; enter 0 where appropriate.</p>
            </section>
            <MealPicker value={draft.meal} onChange={set("meal")} />
            {dateFields}
            <details className="border-t border-solid border-border pt-2 [&_summary]:min-h-11 [&_summary]:leading-5 [&_summary]:py-3">
              <summary>Sugar, fibre, sodium, note</summary>
              <div className="grid gap-4 pt-2">
                <div className="row3 grid grid-cols-3 gap-3 max-[381px]:gap-2">
                  <TextField label="Sugar" type="number" value={draft.sugar} onChange={set("sugar")} />
                  <TextField label="Fibre" type="number" value={draft.fiber} onChange={set("fiber")} />
                  <TextField label="Sodium mg" type="number" value={draft.sodium_mg} onChange={set("sodium_mg")} />
                </div>
                <p className="text-ui-caption text-subtle">Sugar and fibre in grams; sodium in milligrams.</p>
                <TextField label="Private note" value={draft.note} onChange={set("note")} />
                <p className="text-ui-caption text-subtle">This note stays in your journal and isn’t sent to Google.</p>
              </div>
            </details>
          </fieldset>
          <div className="sticky bottom-0 grid gap-3 border-t border-solid border-border bg-card px-6 py-4 max-[761px]:px-5">
            {problem && (
              <div className="consequence bg-warning-muted text-warning text-ui-label leading-5 py-3 px-3.5 rounded-xl" role="alert">
                {problem}
              </div>
            )}
            <div className="buttons flex items-center gap-2 [&_.primary]:flex-1 [&_button]:min-h-11">
              <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>{saving ? "Logging…" : "Log food"}</Button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}
