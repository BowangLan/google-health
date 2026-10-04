/** Fresh concept E: compare a next meal, adjust its portion, then keep a local plan or review a logging draft.
 * Graphite #191c20, ash #282d33, amber #efc17b, mint #99c7b7, chalk #f1efea.
 * Rounded system display / plain system body / monospaced allowance receipt.
 * Signature: a before→after allowance receipt, without scores, history charts, or a record-first home. */
import { useState } from "react";
import { IconCheck as CheckIcon, IconArrowRight as ArrowRightIcon, IconMinus as MinusIcon } from "@/lib/icons";
import { IconAdd, IconAgain, IconClose, IconFood, IconLedger, IconNext, IconSync, IconWeight } from "@/lib/icons";
import { FOOD_LIBRARY } from "./data";
import { dateLabel, type DemoFood, type DemoTotals, type DesignProps, type Meal } from "./types";
import "./next.css";

const CHOICES = [
  { food: FOOD_LIBRARY[4]!, label: "A cooked plate", note: "Salmon & roasted potatoes", short: "Salmon plate", detail: "42 g protein · 1 plate", tag: "Cook at home" },
  { food: FOOD_LIBRARY[2]!, label: "A familiar bowl", note: "Chicken, avocado & rice", short: "Chicken bowl", detail: "44 g protein · 1 bowl", tag: "Repeat a favorite" },
  { food: FOOD_LIBRARY[5]!, label: "A lighter portion", note: "Lettuce-wrapped ShackBurger", short: "Lettuce-wrap burger", detail: "23 g protein · 1 burger", tag: "Pick up food" },
];
const NUTRIENTS = [
  { key: "kcal" as const, name: "Calories", unit: "kcal" },
  { key: "protein" as const, name: "Protein", unit: "g" },
  { key: "carbs" as const, name: "Carbs", unit: "g" },
  { key: "fat" as const, name: "Fat", unit: "g" },
];
const SIDE_OPTIONS = [FOOD_LIBRARY[3]!, FOOD_LIBRARY[0]!];
const format = (value: number) => Math.round(value).toLocaleString();

export function NextVariant(p: DesignProps) {
  const [choice, setChoice] = useState(0);
  const [portion, setPortion] = useState(1);
  const [sideIndex, setSideIndex] = useState(-1);
  const [meal, setMeal] = useState<Meal>("Dinner");
  const [planned, setPlanned] = useState(false);
  const [inspectFoods, setInspectFoods] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const picked = CHOICES[choice]!;
  const side = SIDE_OPTIONS[sideIndex];
  const dayFoods = p.foods.filter(food => food.day === p.day);
  const dayWeights = p.weights.filter(weight => weight.day === p.day);
  const mealLogged = dayFoods.some(food => food.meal === meal);
  const mealTotals: DemoTotals = {
    kcal: Math.round(picked.food.kcal * portion + (side?.kcal ?? 0)),
    protein: Math.round(picked.food.protein * portion + (side?.protein ?? 0)),
    carbs: Math.round(picked.food.carbs * portion + (side?.carbs ?? 0)),
    fat: Math.round(picked.food.fat * portion + (side?.fat ?? 0)),
  };
  const planName = `${picked.food.name}${portion !== 1 ? ` (${portion} ${picked.food.unit})` : ""}${side ? ` + ${side.name}` : ""}`;
  const currentMealLogged = dayFoods.some(food =>
    food.name === planName && food.meal === meal &&
    NUTRIENTS.every(n => food[n.key] === mealTotals[n.key])
  );
  const remaining: DemoTotals = {
    kcal: p.targets.kcal - p.totals.kcal,
    protein: p.targets.protein - p.totals.protein,
    carbs: p.targets.carbs - p.totals.carbs,
    fat: p.targets.fat - p.totals.fat,
  };
  const reviewMeal = () => {
    const food: DemoFood = {
      id: `sample-plan-${choice}`, day: p.day, time: "19:00", meal,
      name: planName,
      amount: 1, unit: "meal", ...mealTotals, state: "local",
    };
    p.onReuseFood(food, p.day);
  };
  const choose = (index: number) => { setChoice(index); setPortion(1); setSideIndex(-1); setPlanned(false); };
  return <div className="next-variant">
    <div className="next-shell">
      <header className="next-header">
        <div className="next-brand"><span><ArrowRightIcon size={23} weight="bold" /></span>next<span className="next-brand-stop">.</span></div>
        <span className="next-header-purpose">A little less deciding.</span>
        <div className="next-header-actions"><button aria-label="Logged food" title="Logged food" onClick={() => setInspectFoods(!inspectFoods)} aria-expanded={inspectFoods}><IconFood size={17} /><span>Logged food</span></button><button onClick={p.onSync}><IconSync size={17} /><span>{p.pending ? `${p.pending} pending` : "Synced"}</span></button></div>
      </header>
      <section className="next-opening">
        <div><span className="next-eyebrow">PLAN THE NEXT THING</span><h1>What’s for {meal === "Anytime" ? "your next meal" : meal.toLowerCase()}?</h1><p>Compare a few options. Make one work for your day.</p></div>
        <button className="next-date" onClick={p.onChooseDate}><IconLedger size={17} /><span>{p.day === p.today ? "Today" : dateLabel(p.day, { weekday: "short" })}<strong>{dateLabel(p.day, { month: "short", day: "numeric" })}</strong></span><IconNext size={14} /></button>
      </section>
      <section className="next-allowance" aria-label="Remaining daily allowance">
        <div className="next-allowance-context"><span>Room in your day</span><small>From {dayFoods.length} logged foods</small></div>
        <div className="next-allowance-values">{NUTRIENTS.map(n => <div key={n.key}><strong>{format(Math.max(0, remaining[n.key]))}<small>{n.unit}</small></strong><span>{n.name}{remaining[n.key] < 0 ? ` · ${format(-remaining[n.key])} ${n.unit} above target` : " remaining"}</span></div>)}</div>
        <button className="next-allowance-link" onClick={() => setInspectFoods(!inspectFoods)} aria-expanded={inspectFoods}>What’s included<IconNext size={14} /></button>
      </section>
      {inspectFoods && <section className="next-records"><div className="next-records-header"><div><h2>Already logged</h2><p>{dateLabel(p.day, { month: "long", day: "numeric" })} · edit a food or repeat its portion</p></div><button className="next-icon" onClick={() => setInspectFoods(false)} aria-label="Close logged food"><IconClose size={19} /></button></div>{dayFoods.length ? dayFoods.map(food => <div className="next-record" key={food.id}><button onClick={() => p.onEditFood(food)}><strong>{food.name}</strong><span>{food.amount} {food.unit} · {food.kcal} kcal · P {food.protein} / C {food.carbs} / F {food.fat} g</span></button><button className="next-icon" aria-label={`Repeat ${food.name}`} onClick={() => p.onReuseFood(food)}><IconAgain size={18} /></button></div>) : <p>No food logged for this day yet.</p>}<button className="next-text-button" onClick={p.onAddFood}><IconAdd size={15} />Log something else</button></section>}
      <section className="next-decision">
        <div className="next-decision-heading"><div><span className="next-step-label">1<span />CHOOSE A STARTING POINT</span><h2>Three ways to make a meal</h2></div><label className="next-meal-select"><span>Planning for</span><select value={meal} onChange={e => { setMeal(e.target.value as Meal); setPlanned(false); }}>{["Breakfast", "Lunch", "Dinner", "Anytime"].map(m => <option key={m}>{m}</option>)}</select></label></div>
        <p className="next-sample-note">Sample meal ideas · estimated nutrition, editable before logging</p>
        <div className="next-choices" aria-label="Sample meal choices">{CHOICES.map((option, index) => <button key={option.food.name} className={`next-choice ${choice === index ? "is-selected" : ""}`} onClick={() => choose(index)} aria-pressed={choice === index}>
          <div className="next-choice-top"><span>{option.tag}</span><i>{choice === index && <CheckIcon size={13} weight="bold" />}</i></div><span className="next-choice-label">{option.label}</span><strong>{option.note}</strong><span className="next-choice-portion">1 {option.food.unit}</span>
          <div className="next-choice-nutrition"><span><b>{option.food.kcal}</b> kcal</span><span>P <b>{option.food.protein}</b> g</span><span>C <b>{option.food.carbs}</b> g</span><span>F <b>{option.food.fat}</b> g</span></div>
          <span className="next-choice-footer">{choice === index ? "Your starting point" : "Try this option"}<ArrowRightIcon size={16} /></span>
        </button>)}</div>
        <div className="next-mobile-compare"><button className="next-text-button" onClick={() => setCompareOpen(!compareOpen)} aria-expanded={compareOpen}>{compareOpen ? "Hide" : "Compare"} all three options<IconNext size={14} /></button>{compareOpen && <div className="next-comparison-table">{CHOICES.map((option,index) => <button key={option.food.name} onClick={() => choose(index)}><strong>{option.short}</strong><span>{option.food.kcal} kcal · P {option.food.protein} / C {option.food.carbs} / F {option.food.fat} g</span>{choice===index && <CheckIcon size={13}/>}</button>)}</div>}</div>
        <div className="next-plan-workspace">
          <div className="next-plate-editor"><span className="next-step-label">2<span />MAKE IT YOURS</span><div className="next-plate-title"><h2>{picked.short}</h2><span className={`next-plan-status ${planned || currentMealLogged ? "is-kept" : ""}`}>{currentMealLogged ? "Logged" : planned ? "Plan kept" : "Planning"}{!currentMealLogged && <span> · not logged</span>}</span></div>
            <div className="next-portion-row"><div><span>Main portion</span><strong>{portion} {picked.food.unit}{portion > 1 ? "s" : ""}</strong></div><div className="next-stepper"><button aria-label="Smaller portion" disabled={portion <= .5} onClick={() => { setPortion(v => Math.max(.5, v - .25)); setPlanned(false); }}><MinusIcon size={17} /></button><output aria-live="polite">{portion}×</output><button aria-label="Larger portion" disabled={portion >= 1.5} onClick={() => { setPortion(v => Math.min(1.5, v + .25)); setPlanned(false); }}><IconAdd size={17} /></button></div></div>
            <label className="next-side-label"><span>Add a side <small>optional</small></span><select value={sideIndex} onChange={e => { setSideIndex(Number(e.target.value)); setPlanned(false); }}><option value={-1}>No side — just the main</option>{SIDE_OPTIONS.map((option,index) => <option key={option.name} value={index}>{option.name} · {option.kcal} kcal</option>)}</select></label>
            <div className="next-plate-total"><span>For this whole meal</span><div>{NUTRIENTS.map(n => <span key={n.key}><strong>{format(mealTotals[n.key])}</strong><small>{n.key === "kcal" ? "kcal" : `${n.name.toLowerCase()} · g`}</small></span>)}</div><p>{portion} {picked.food.unit}{side ? ` + 1 ${side.unit} of ${side.name.toLowerCase()}` : ""}. These are portion totals.</p></div>
            <button className="next-text-button" onClick={() => choose((choice + 1) % CHOICES.length)}><IconAgain size={15} />Try a different main</button>
          </div>
          <div className="next-receipt"><div className="next-receipt-heading"><span className="next-step-label">{currentMealLogged ? "IF YOU LOG THIS MEAL AGAIN" : "IF YOU LOG THIS MEAL"}</span><h3>What would be left?</h3><p>Your configured targets stay the same.</p></div>
            <div className="next-receipt-column-labels"><span>Allowance</span><span>Now</span><span>After meal</span></div>
            {NUTRIENTS.map(n => { const after = remaining[n.key] - mealTotals[n.key]; return <div key={n.key} className="next-receipt-row"><span>{n.name}<small>{n.unit}</small></span><span>{format(Math.max(0,remaining[n.key]))}</span><span className={after < 0 ? "is-above" : ""}>{format(Math.abs(after))}<small>{after < 0 ? "above target" : "left"}</small></span></div>; })}
            <div className="next-receipt-foot"><span /><p>{currentMealLogged ? <>This meal is already included in your totals.<br />This preview shows an additional meal.</> : <>Planned food doesn’t change your totals.<br />Review and save after you’ve eaten.</>}</p></div>
          </div>
        </div>
        <div className="next-plan-actions"><div><span className="next-action-icon"><IconFood size={20} /></span><p><strong>{currentMealLogged ? "Your meal is recorded." : planned ? "Your meal is planned." : "A plan now. A food log when you eat."}</strong><span>{`${currentMealLogged ? "Logged · " : ""}${picked.short} · ${mealTotals.kcal} kcal · ${meal.toLowerCase()}`}</span></p></div><div><button className="next-keep" disabled={currentMealLogged} onClick={() => setPlanned(!planned)}>{currentMealLogged ? <><CheckIcon size={16} />Logged</> : planned ? <><CheckIcon size={16} />Plan kept · undo</> : "Keep this plan"}</button><button className="next-primary" onClick={reviewMeal}>{currentMealLogged ? "Log again" : "Review & log"}<ArrowRightIcon size={17} /></button></div></div>
      </section>
      <section className="next-finish"><div className="next-finish-heading"><span className="next-eyebrow">A FEW LOOSE ENDS</span><h2>Finish your day</h2><p>Small actions. In the order you need them.</p></div><div className="next-checklist"><button onClick={p.onAddWeight}><span className={`next-task-icon ${dayWeights.length ? "is-done" : ""}`}>{dayWeights.length ? <CheckIcon size={19} /> : <IconWeight size={19} />}</span><span><strong>{dayWeights.length ? "Weight recorded" : "Record a weigh-in"}</strong><small>{dayWeights.length ? `${dayWeights[0]!.value} ${dayWeights[0]!.unit} · add another if needed` : "No measurement for this day"}</small></span><IconNext size={16} /></button><button onClick={mealLogged ? () => setInspectFoods(true) : p.onAddFood}><span className={`next-task-icon ${mealLogged ? "is-done" : ""}`}>{mealLogged ? <CheckIcon size={19} /> : <IconFood size={19} />}</span><span><strong>{mealLogged ? `${meal} is logged` : `Log ${meal === "Anytime" ? "your next meal" : meal.toLowerCase()} when you’re ready`}</strong><small>{mealLogged ? "See what’s already included" : "A kept plan is separate from a saved food"}</small></span><IconNext size={16} /></button><button onClick={p.onSync}><span className={`next-task-icon ${!p.pending ? "is-done" : ""}`}>{!p.pending ? <CheckIcon size={19} /> : <IconSync size={19} />}</span><span><strong>{p.pending ? "Sync your saved changes" : "Saved changes are synced"}</strong><small>{p.pending ? `${p.pending} change${p.pending === 1 ? "" : "s"} waiting · review before syncing` : `Last synced ${p.lastSynced}`}</small></span><IconNext size={16} /></button></div></section>
      <footer className="next-footer"><span>Sample meal estimates · editable before saving.</span><span>Food allowance uses your configured targets, independently of calories burned.</span></footer>
    </div>
  </div>;
}
