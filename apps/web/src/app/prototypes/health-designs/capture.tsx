/** Throwaway design D: capture first; select, adjust, inspect, then confirm. */
import { useState } from "react";
import { IconAdd, IconFood, IconWeight, IconSync, IconEdit, IconNext, IconLedger, IconAgain } from "@/lib/icons";
import { FOOD_LIBRARY } from "./data";
import { dateLabel, type DesignProps, type DemoFood } from "./types";
import "./capture.css";

type LibraryFood = typeof FOOD_LIBRARY[number];
const fmt = (n: number) => Number(n.toFixed(1)).toLocaleString("en-US");

export function CaptureVariant(props: DesignProps) {
  const [mode, setMode] = useState<"food" | "weight">("food");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LibraryFood>(FOOD_LIBRARY[0]!);
  const [amount, setAmount] = useState(1);
  const matches = FOOD_LIBRARY.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
  const factor = amount / selected.amount;
  const recent = props.foods.slice(-3).reverse();
  const lastWeight = props.weights.at(-1);
  function choose(food: LibraryFood) { setSelected(food); setAmount(food.amount); }
  function review() {
    const draft: DemoFood = { ...selected, amount, kcal: Math.round(selected.kcal * factor), protein: Number((selected.protein * factor).toFixed(1)), carbs: Number((selected.carbs * factor).toFixed(1)), fat: Number((selected.fat * factor).toFixed(1)), day: props.today, time: "16:30", id: `capture-${selected.name}`, state: "local" };
    props.onReuseFood(draft);
  }

  return <div className="capture-variant">
    <header className="capture-header">
      <a href="#capture-workspace" className="capture-brand"><span className="capture-mark"><IconFood size={19} /></span>health<span className="capture-wordmark-dot">/</span><small>capture</small></a>
      <div className="capture-mode" aria-label="What to record"><button className={mode === "food" ? "active" : ""} aria-pressed={mode === "food"} onClick={() => setMode("food")}><IconFood size={16} />Food</button><button className={mode === "weight" ? "active" : ""} aria-pressed={mode === "weight"} onClick={() => setMode("weight")}><IconWeight size={16} />Weight</button></div>
      <button className="capture-sync" onClick={props.onSync}><span className={props.pending ? "capture-status local" : "capture-status"} />{props.pending ? `${props.pending} waiting to sync` : "All changes synced"}<IconSync size={15} /></button>
    </header>

    <main className="capture-main" id="capture-workspace">
      <div className="capture-intro"><div className="capture-eyebrow"><span /> LESS FRICTION. MORE FOLLOW-THROUGH.</div><h1>{mode === "food" ? <>What did<br className="capture-mobile-break" /> you have?</> : <>A moment<br className="capture-mobile-break" /> to check in.</>}</h1><p>{mode === "food" ? "Start with something familiar. Make it your portion." : "A measurement, a unit, a time. That's all you need."}</p></div>
      <div className="capture-layout">
        <section className="capture-workspace" aria-label={mode === "food" ? "Food capture" : "Weight capture"}>
          {mode === "food" ? <>
            <div className="capture-searchbar"><IconFood size={23} /><label className="capture-sr-only" htmlFor="capture-search">Find a frequent food</label><input id="capture-search" type="search" placeholder="Find a food you know…" value={query} onChange={e => setQuery(e.target.value)} /><span className="capture-search-hint">6 sample foods</span></div>
            <div className="capture-picker-heading"><span>{query ? "MATCHING QUICK PICKS" : "YOUR QUICK PICKS"}</span><button onClick={props.onAddFood}>Something new <IconAdd size={13} /></button></div>
            <div className="capture-picks">
              {matches.map(food => <button className={selected.name === food.name ? "capture-pick selected" : "capture-pick"} aria-pressed={selected.name === food.name} key={food.name} onClick={() => choose(food)}><span className="capture-pick-glyph">{food.unit === "cup" ? <span className="capture-cup-glyph">◡</span> : <IconFood size={20} />}</span><span className="capture-pick-text"><strong>{food.name}</strong><small>{food.amount} {food.unit} · {food.kcal} kcal</small></span><span className="capture-pick-check">{selected.name === food.name ? <span aria-hidden="true">✓</span> : <IconAdd size={14} />}</span><span className="capture-pick-macros">P {food.protein} · C {food.carbs} · F {food.fat} g</span></button>)}
              {!matches.length && <div className="capture-no-results"><p>No sample matches for “{query}”.</p><button onClick={props.onAddFood}>Enter a new food <IconAdd size={15} /></button></div>}
            </div>
            <section className="capture-draft" aria-label="Selected portion">
              <div className="capture-draft-heading"><span className="capture-eyebrow">YOUR PORTION</span><span className="capture-draft-date"><IconLedger size={13} />{dateLabel(props.today)} · 4:30 PM Pacific</span></div>
              <h2>{selected.name}</h2>
              <div className="capture-portion-line"><div><label htmlFor="capture-amount">How much did you have?</label><p>Nutrition adjusts with your portion.</p></div><div className="capture-amount"><button aria-label="Decrease portion" disabled={amount <= .25} onClick={() => setAmount(Math.max(.25, amount - .25))}>−</button><input id="capture-amount" aria-label="Portion amount" type="number" min="0.25" step="0.25" value={amount} onChange={e => setAmount(Number(e.target.value))} /><span>{selected.unit}{amount !== 1 ? "s" : ""}</span><button aria-label="Increase portion" onClick={() => setAmount(amount + .25)}><IconAdd size={15} /></button></div></div>
              <div className="capture-portion-presets" aria-label="Common portions">{[.5, 1, 1.5, 2].map(a => <button key={a} aria-pressed={amount === a} className={amount === a ? "selected" : ""} onClick={() => setAmount(a)}>{a === .5 ? "½" : a === 1.5 ? "1½" : a} {selected.unit}{a !== 1 ? "s" : ""}</button>)}</div>
              <div className="capture-nutrition" aria-label="Nutrition for selected portion"><div className="capture-energy"><strong>{fmt(Math.round(selected.kcal * factor))}</strong><span>kcal</span></div><div><span><i className="capture-protein-dot" />Protein</span><strong>{fmt(selected.protein * factor)} <small>g</small></strong></div><div><span><i className="capture-carbs-dot" />Carbs</span><strong>{fmt(selected.carbs * factor)} <small>g</small></strong></div><div><span><i className="capture-fat-dot" />Fat</span><strong>{fmt(selected.fat * factor)} <small>g</small></strong></div></div>
              <div className="capture-confirm"><p>Nothing saved yet.<br />Review the details before you log.</p><button className="capture-primary" disabled={amount <= 0 || !Number.isFinite(amount)} onClick={review}>Review food <IconNext size={19} /></button></div>
            </section>
          </> : <section className="capture-weight-start">
            <div className="capture-scale-art" aria-hidden="true"><div className="capture-scale-ticks" /><IconWeight size={52} /><span>lb / kg</span></div>
            <span className="capture-eyebrow">A SINGLE MEASUREMENT</span><h2>Record your weight.</h2><p>Choose pounds or kilograms, then add your measurement. You can confirm the date and time before saving.</p><div className="capture-weight-destination"><IconLedger size={16} /><span>For {dateLabel(props.day, { weekday: "short", month: "short", day: "numeric" })}</span><button onClick={props.onChooseDate}>Change date</button></div><button className="capture-primary" onClick={props.onAddWeight}>Enter a weigh-in <IconNext size={20} /></button><small>Always your measurement. Always your chosen unit.</small>
          </section>}
        </section>

        <aside className="capture-receipts" aria-label="Saved records">
          <div className="capture-receipt-heading"><span className="capture-eyebrow">SAVED & ACCOUNTED FOR</span><button onClick={props.onChooseDate}>{dateLabel(props.day)}<IconLedger size={13} /></button></div>
          <h2>Your last few saves.</h2><p className="capture-receipt-subtitle">A little confirmation goes a long way.</p>
          <div className="capture-receipt-stack">{recent.map(food => <article className="capture-receipt" key={food.id}><div className="capture-receipt-top"><span><span aria-hidden="true">✓</span>{food.state === "local" ? "SAVED LOCALLY" : "SYNCED"}</span><time>{food.time}</time></div><button className="capture-receipt-name" onClick={() => props.onEditFood(food)}>{food.name}</button><p>{food.amount} {food.unit} <span>{food.kcal} kcal</span></p><div className="capture-receipt-macros"><span>P {food.protein} g</span><span>C {food.carbs} g</span><span>F {food.fat} g</span></div><div className="capture-receipt-actions"><button onClick={() => props.onEditFood(food)}><IconEdit size={12} />Edit</button><button onClick={() => props.onReuseFood(food)}><IconAgain size={12} />Have it again</button></div></article>)}{!recent.length && <div className="capture-receipt-empty"><IconFood size={26} /><p>No food saved on {dateLabel(props.day)}.</p><span>Your next save will appear here.</span></div>}</div>
          {lastWeight && <div className="capture-last-weight"><IconWeight size={20} /><div><span>Last weigh-in on this day</span><strong>{lastWeight.value} <small>{lastWeight.unit}</small></strong></div><time>{lastWeight.time}</time></div>}
          <button className="capture-receipt-sync" onClick={props.onSync}><IconSync size={16} /><span><strong>Google Health</strong><small>{props.pending ? `${props.pending} local ${props.pending === 1 ? "change" : "changes"} ready` : `Last synced ${props.lastSynced}`}</small></span><IconNext size={14} /></button>
          <p className="capture-sample-note">Sample food values. Every detail is editable before saving in this preview.</p>
        </aside>
      </div>
      <footer className="capture-footer"><span>RECORD THE MOMENT. GET ON WITH YOUR DAY.</span><span>Food + weight, in one place.</span></footer>
    </main>
  </div>;
}
