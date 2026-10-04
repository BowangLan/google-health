/** Three fresh task-focused dark concepts on the existing route, via ?prototype=1&variant=D|E|F. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { IconAdd, IconClose, IconPrev, IconNext, IconFood, IconWeight, IconSync, IconAgain } from "@/lib/icons";
import { CaptureVariant } from "./capture";
import { NextVariant } from "./next";
import { RitualVariant } from "./ritual";
import type { DemoFood, DemoWeight, DesignProps, Meal } from "./types";
import { MEALS, dateLabel, shiftDate } from "./types";
import { DEMO_TODAY, FOOD_LIBRARY, TARGETS, makeHistory, seedData, totalFoods } from "./data";
import "./prototype.css";

const VARIANTS = [{ key: "D", name: "Capture", caption: "Record quickly" }, { key: "E", name: "Next", caption: "Choose a meal" }, { key: "F", name: "Ritual", caption: "Build a routine" }];
type Panel = { kind: "food"; food?: DemoFood; reuse?: boolean; reuseDay?: string } | { kind: "weight" } | { kind: "date" } | { kind: "sync" } | null;
function readVariant() { const key = new URLSearchParams(location.search).get("variant"); return VARIANTS.find(v => v.key === key)?.key ?? "D"; }
function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const d = ref.current; d?.showModal(); d?.querySelector<HTMLInputElement>("[data-autofocus]")?.focus(); return () => d?.close(); }, []);
  return <dialog className="prototype-dialog" ref={ref} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if(e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="prototype-dialog-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="prototype-icon-button" aria-label="Close dialog" onClick={onClose}><IconClose size={22}/></button></div>{children}
  </dialog>;
}
function FoodForm({ food, reuse, reuseDay, onSave, onDelete, onClose }: { food?: DemoFood; reuse?: boolean; reuseDay?: string; onSave: (food: DemoFood) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<Omit<DemoFood, "id" | "day" | "state"> | null>(food ?? null);
  const [draft, setDraft] = useState<DemoFood>(() => food ? { ...food, id: reuse ? crypto.randomUUID() : food.id, day: reuse ? (reuseDay ?? DEMO_TODAY) : food.day, time: reuse ? "16:30" : food.time, state: "local" } : { id: crypto.randomUUID(), day: DEMO_TODAY, time: "16:30", name: "", meal: "Anytime", amount: 1, unit: "portion", kcal: 0, protein: 0, carbs: 0, fat: 0, state: "local" });
  const [query, setQuery] = useState("");
  const [step, setStep] = useState(food ? "details" : "search");
  const set = <K extends keyof DemoFood>(key: K, value: DemoFood[K]) => setDraft(d => ({ ...d, [key]: value }));
  function choose(item: typeof FOOD_LIBRARY[number]) { setPicked(item); setDraft(d => ({ ...d, ...item, day: d.day, time: d.time, state: "local" })); setStep("details"); }
  function amount(value: number) { setDraft(d => { const factor = picked && value > 0 ? value / picked.amount : null; return { ...d, amount: value, ...(factor === null ? {} : { kcal: Math.round(picked!.kcal * factor), protein: Number((picked!.protein * factor).toFixed(1)), carbs: Number((picked!.carbs * factor).toFixed(1)), fat: Number((picked!.fat * factor).toFixed(1)) }) }; }); }
  function save(e: FormEvent) { e.preventDefault(); onSave(draft); }
  return <form onSubmit={save} className="prototype-form">
    <div className="prototype-form-pair"><label>Date<input type="date" required value={draft.day} onChange={e => set("day", e.target.value)}/></label><label>Time (Pacific)<input type="time" required value={draft.time} onChange={e => set("time", e.target.value)}/></label></div>
    {step === "search" ? <>
      <label>Find a food<input autoFocus data-autofocus type="search" placeholder="Search recent foods or add something new" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <div className="prototype-results"><h3>{query ? "Matching foods" : "Recent foods"}</h3>{FOOD_LIBRARY.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).map(f => <button type="button" className="prototype-result" key={f.name} onClick={() => choose(f)}><span><strong>{f.name}</strong><small>{f.amount} {f.unit} · {f.kcal} kcal · P {f.protein} g · C {f.carbs} g · F {f.fat} g</small></span><IconAdd size={20}/></button>)}<button type="button" className="prototype-new-food" onClick={() => { setPicked(null); setDraft(d => ({ ...d, name: query })); setStep("details"); }}><IconAdd size={18}/> Add a new food{query ? `: ${query}` : ""}</button></div>
    </> : <>
      {!food && <button type="button" className="prototype-back" onClick={() => setStep("search")}><IconPrev size={14}/> Back to search</button>}
      <label>Food name<input autoFocus data-autofocus required value={draft.name} onChange={e => set("name", e.target.value)}/></label>
      <div className="prototype-form-pair"><label>Amount<input type="number" step="any" min="0.01" required value={draft.amount} onChange={e => amount(Number(e.target.value))}/></label><label>Unit<input required value={draft.unit} onChange={e => set("unit", e.target.value)}/></label></div>
      <label>Meal<select value={draft.meal} onChange={e => set("meal", e.target.value as Meal)}>{MEALS.map(m => <option key={m}>{m}</option>)}</select></label>
      <p className="prototype-form-note">Nutrition totals for the amount eaten{picked ? ". Changing amount scales this food's totals." : ". Enter the totals for this portion."}</p>
      <div className="prototype-nutrient-fields">{([['kcal','Calories','kcal'],['protein','Protein','g'],['carbs','Carbs','g'],['fat','Fat','g']] as const).map(([key,label,unit]) => <label key={key}>{label}<span className="prototype-input-unit"><input type="number" min="0" step="any" required value={draft[key]} onChange={e => set(key, Number(e.target.value))}/><small>{unit}</small></span></label>)}</div>
      <div className="prototype-form-footer">{food && !reuse ? <button type="button" className="prototype-delete" onClick={() => onDelete(food.id)}>Delete record</button> : <button type="button" className="prototype-secondary" onClick={onClose}>Cancel</button>}<button className="prototype-primary" type="submit">{food && !reuse ? "Save changes" : "Log food"}</button></div>
    </>}
  </form>;
}
function WeightForm({ day, onSave, onClose }: { day: string; onSave: (weight: DemoWeight) => void; onClose: () => void }) {
  const [date, setDate] = useState(day), [value, setValue] = useState(""), [unit, setUnit] = useState<"lb" | "kg">("lb"), [time, setTime] = useState("07:10");
  return <form className="prototype-form" onSubmit={e => { e.preventDefault(); onSave({ id: crypto.randomUUID(), day: date, time, value: Number(value), unit, state: "local" }); }}>
    <div className="prototype-form-pair"><label>Date<input type="date" required value={date} onChange={e => setDate(e.target.value)}/></label><label>Time (Pacific)<input type="time" required value={time} onChange={e => setTime(e.target.value)}/></label></div>
    <div className="prototype-form-pair"><label>Weight<input autoFocus data-autofocus type="number" step="0.1" min="1" required placeholder={unit === "lb" ? "171.8" : "77.9"} value={value} onChange={e => setValue(e.target.value)}/></label><label>Unit<select value={unit} onChange={e => setUnit(e.target.value as "lb" | "kg")}><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label></div>
    <p className="prototype-form-note">This is a measured weigh-in. The trend is shown separately.</p><div className="prototype-form-footer"><button type="button" className="prototype-secondary" onClick={onClose}>Cancel</button><button type="submit" className="prototype-primary">Log weight</button></div>
  </form>;
}

export function DesignPrototype() {
  const [variant, setVariant] = useState(readVariant), [data, setData] = useState(seedData);
  const [day, setDay] = useState(() => new URLSearchParams(location.search).get("date") || DEMO_TODAY);
  const [range, setRange] = useState(30), [panel, setPanel] = useState<Panel>(null), [notice, setNotice] = useState("");
  const [synced, setSynced] = useState("Today, 4:12 PM");
  const history = useMemo(() => makeHistory(data.foods, data.weights, range), [data, range]);
  const foods = data.foods.filter(f => f.day === day), weights = data.weights.filter(w => w.day === day);
  const pending = [...data.foods, ...data.weights].filter(r => r.state === "local").length;
  function notify(text: string) { setNotice(text); }
  useEffect(() => { if(!notice) return; const t = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(t); }, [notice]);
  function changeVariant(key: string) { const url = new URL(location.href); url.searchParams.set("prototype", "1"); url.searchParams.set("variant", key); historyReplace(url); setVariant(key); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }
  function changeDay(value: string) { const url = new URL(location.href); url.searchParams.set("date", value); historyReplace(url); setDay(value); }
  function historyReplace(url: URL) { window.history.replaceState({}, "", url); }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if(document.querySelector('dialog[open]') || target.isContentEditable || target.closest('input,textarea,select,[role="button"],svg') || e.metaKey || e.ctrlKey || e.altKey) return;
      if(e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const at = VARIANTS.findIndex(v => v.key === variant); changeVariant(VARIANTS[(at + (e.key === "ArrowRight" ? 1 : 2)) % 3]!.key); }
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [variant]);
  useEffect(() => { const handle = () => { setVariant(readVariant()); setDay(new URLSearchParams(location.search).get("date") || DEMO_TODAY); }; window.addEventListener("popstate",handle); return () => window.removeEventListener("popstate",handle); }, []);
  const props: DesignProps = { day, today: DEMO_TODAY, foods, weights, totals: totalFoods(foods), targets: TARGETS, burned: day === DEMO_TODAY ? 2440 : 2520, history, range, pending, lastSynced: synced, onDayChange: changeDay, onChooseDate: () => setPanel({ kind: "date" }), onAddFood: () => setPanel({ kind: "food" }), onEditFood: food => setPanel({ kind: "food", food }), onReuseFood: (food, reuseDay) => setPanel({ kind: "food", food, reuse: true, reuseDay }), onAddWeight: () => setPanel({ kind: "weight" }), onRangeChange: setRange, onSync: () => setPanel({ kind: "sync" }) };
  const Variant = variant === "E" ? NextVariant : variant === "F" ? RitualVariant : CaptureVariant;
  return <div className="design-prototype" data-variant={variant}>
    <Variant {...props}/>
    <aside className="prototype-switcher" aria-label="Design comparison"><button aria-label="Previous design" onClick={() => { const at=VARIANTS.findIndex(v=>v.key===variant);changeVariant(VARIANTS[(at+2)%3]!.key); }}><IconPrev size={18}/></button><div className="prototype-switcher-options">{VARIANTS.map(v => <button key={v.key} aria-pressed={v.key===variant} onClick={() => changeVariant(v.key)}><b>{v.key}</b><span>{v.name}</span></button>)}</div><button aria-label="Next design" onClick={() => { const at=VARIANTS.findIndex(v=>v.key===variant);changeVariant(VARIANTS[(at+1)%3]!.key); }}><IconNext size={18}/></button><span className="prototype-sample-label">Sample data</span><button aria-label="Reset sample data" title="Reset sample data" onClick={() => { setData(seedData());changeDay(DEMO_TODAY);setRange(30);notify("Sample data reset"); }}><IconAgain size={17}/></button></aside>
    {notice && <div className="prototype-toast" role="status">{notice}</div>}
    {panel?.kind === "food" && <Modal title={panel.food && !panel.reuse ? "Edit food" : "Log food"} subtitle="Sample records · changes stay in this preview" onClose={() => setPanel(null)}><FoodForm food={panel.food} reuse={panel.reuse} reuseDay={panel.reuseDay} onClose={() => setPanel(null)} onSave={food => { setData(d => ({ ...d, foods: [...d.foods.filter(f => f.id !== food.id), food] })); changeDay(food.day);setPanel(null);notify(panel.food && !panel.reuse ? "Food updated in preview" : "Food logged in preview"); }} onDelete={id => { setData(d=>({ ...d,foods:d.foods.filter(f=>f.id!==id) }));setPanel(null);notify("Food removed from preview"); }}/></Modal>}
    {panel?.kind === "weight" && <Modal title="Log weight" subtitle="Sample record · explicit date and unit" onClose={() => setPanel(null)}><WeightForm day={day} onClose={() => setPanel(null)} onSave={weight => { setData(d=>({ ...d,weights:[...d.weights,weight] }));changeDay(weight.day);setPanel(null);notify("Weight logged in preview"); }}/></Modal>}
    {panel?.kind === "date" && <Modal title="Choose a day" subtitle="Choose the date for this task" onClose={() => setPanel(null)}><div className="prototype-form"><label>Date<input type="date" value={day} onChange={e => { if(e.target.value) changeDay(e.target.value); }}/></label><div className="prototype-date-grid">{Array.from({length:7},(_,i)=>shiftDate(DEMO_TODAY,i-6)).map(d=><button className={d===day ? "chosen" : ""} key={d} onClick={()=>{changeDay(d);setPanel(null);}}><small>{dateLabel(d,{weekday:"short"})}</small><b>{dateLabel(d,{day:"numeric"})}</b></button>)}</div><div className="prototype-form-footer"><button className="prototype-secondary" onClick={()=>{changeDay(DEMO_TODAY);setPanel(null);}}>Today</button><button className="prototype-primary" onClick={()=>setPanel(null)}>Show this day</button></div></div></Modal>}
    {panel?.kind === "sync" && <Modal title="Google Health" subtitle="Preview of local changes and sync status" onClose={() => setPanel(null)}><div className="prototype-form"><div className="prototype-sync-summary"><IconSync size={28}/><div><strong>{pending ? `${pending} local ${pending===1 ? "change" : "changes"}` : "All sample records synced"}</strong><p>Last sync: {synced}</p></div></div><p className="prototype-form-note">Sync is simulated in this design preview. Your Google Health account is not connected.</p><div className="prototype-sync-list">{data.foods.filter(f=>f.state==="local").slice(-5).map(f=><div key={f.id}><IconFood size={18}/><span>{f.name}<small>{dateLabel(f.day)} · {f.kcal} kcal</small></span><b>Local</b></div>)}{data.weights.filter(w=>w.state==="local").slice(-5).map(w=><div key={w.id}><IconWeight size={18}/><span>Weigh-in<small>{dateLabel(w.day)} · {w.value} {w.unit}</small></span><b>Local</b></div>)}</div><div className="prototype-form-footer"><button className="prototype-secondary" onClick={()=>setPanel(null)}>Close</button><button className="prototype-primary" onClick={()=>{setData(d=>({foods:d.foods.map(f=>({...f,state:"synced"})),weights:d.weights.map(w=>({...w,state:"synced"}))}));setSynced("Just now");setPanel(null);notify("Sample records synced in preview");}}>Simulate sync</button></div></div></Modal>}
  </div>;
}
