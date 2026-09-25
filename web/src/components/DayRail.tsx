import { useState } from "react";
import { MEALS, MEAL_NAME, clock, num, parseDay, relativeDay } from "../lib/format";
import type { DayView, FoodRow, Kind, Targets, WeightRow } from "../lib/types";
import { DeleteConfirm, EditRecord } from "./EditRecord";
import { IconAdd, IconAgain, IconCatalogue, IconDelete, IconEdit } from "../lib/icons";
import { TextField, UnitPicker } from "./fields";

type Open = { path: string; mode: "edit" | "delete" } | null;

function Totals({ totals, count, target }: {
  totals: DayView["totals"]; count: number; target: number | null;
}) {
  const ratio = target ? Number(totals.kcal) / target : 0;
  return (
    <div className="totals">
      <div className="totals-kcal">{num(totals.kcal) ?? "0"}</div>
      {target ? (
        <>
          <div className="totals-of">{`of ${num(target)} · ${Math.round(ratio * 100)}%`}</div>
          <div className="totals-bar">
            <b style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
            {ratio > 1 && <b className="over" style={{ width: `${Math.min(ratio - 1, 1) * 100}%` }} />}
          </div>
        </>
      ) : (
        <div className="totals-of">{count} {count === 1 ? "entry" : "entries"}</div>
      )}
      <div className="macros">
        <span>P <b>{num(totals.protein, 1) ?? "0"}</b></span>
        <span>C <b>{num(totals.carbs, 1) ?? "0"}</b></span>
        <span>F <b>{num(totals.fat, 1) ?? "0"}</b></span>
        {totals.fiber ? <span>Fib <b>{num(totals.fiber, 1)}</b></span> : null}
        {totals.sugar ? <span>Sug <b>{num(totals.sugar, 1)}</b></span> : null}
      </div>
    </div>
  );
}

function Row({ kind, record, title, meta, figure, open, setOpen, onAgain, onChanged }: {
  kind: Kind;
  record: FoodRow | WeightRow;
  title: string;
  meta: string;
  figure?: string | null;
  open: Open;
  setOpen: (open: Open) => void;
  onAgain?: () => void;
  onChanged: (message: string, staged?: boolean) => void;
}) {
  const mine = open?.path === record.path ? open.mode : null;
  const classes = ["entry"];
  if (record.state === "new" || record.state === "edited") classes.push("pending");
  if (record.state === "awaiting pull") classes.push("conflict");

  if (mine === "edit") {
    return (
      <EditRecord
        kind={kind}
        record={record}
        onDone={(message) => { setOpen(null); onChanged(message); }}
        onCancel={() => setOpen(null)}
      />
    );
  }
  if (mine === "delete") {
    return (
      <DeleteConfirm
        kind={kind}
        record={record}
        title={title}
        onDone={(message, staged) => { setOpen(null); onChanged(message, staged); }}
        onCancel={() => setOpen(null)}
      />
    );
  }

  return (
    <div className={classes.join(" ")}>
      <div className="entry-main">
        <div className="entry-name">
          {"identified" in record && record.identified && (
            <span className="ref" title="From Google's catalogue: its nutrition may be recomputed from that reference.">
              <IconCatalogue size={14} aria-hidden focusable="false" />
            </span>
          )}
          {title}
        </div>
        <div className="entry-meta">{meta}</div>
      </div>
      {figure ? <div className="entry-kcal">{figure}</div> : null}
      <div className="entry-menu">
        {/* Icon-only is fine for edit: conventional glyph, unambiguous target.
            Re-log and delete keep their words, because a lone counter-clockwise
            arrow reads as undo and a lone bin beside a pencil is the classic
            misclick. */}
        <button className="icon" type="button" aria-label="Edit" title="Edit"
          onClick={() => setOpen({ path: record.path, mode: "edit" })}>
          <IconEdit aria-hidden focusable="false" />
        </button>
        {onAgain && (
          <button className="icon" type="button" title="Log this again today" onClick={onAgain}>
            <IconAgain aria-hidden focusable="false" />Again
          </button>
        )}
        <button className="icon danger" type="button" title="Delete this record"
          onClick={() => setOpen({ path: record.path, mode: "delete" })}>
          <IconDelete aria-hidden focusable="false" />Delete
        </button>
      </div>
    </div>
  );
}

function WeightForm({ day, isToday, unit, onCancel, onLogged, run }: {
  day: string;
  isToday: boolean;
  unit: "kg" | "lb";
  onCancel: () => void;
  onLogged: () => void;
  run: (collection: "weight", command: string, values: Record<string, string | boolean>) => Promise<{ ok: boolean; text: string }>;
}) {
  const [value, setValue] = useState("");
  const [chosen, setChosen] = useState<"kg" | "lb">(unit);
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    setSaving(true);
    const values: Record<string, string | boolean> = {
      value: value.trim(), unit: chosen, at, remote_note: note.trim(),
    };
    if (!isToday) values.date = day;
    const outcome = await run("weight", "add", values);
    setSaving(false);
    if (outcome.ok) onLogged();
  }

  return (
    <form className="fields" onSubmit={submit}>
      <div className="row2">
        <TextField label="Weight" type="number" value={value} onChange={setValue} autoFocus />
        <UnitPicker value={chosen} onChange={setChosen} />
      </div>
      <div className="row2">
        <TextField label="Time" type="time" value={at} onChange={setAt} />
        <TextField label="Note sent to Google" value={note} onChange={setNote} />
      </div>
      <div className="buttons">
        <button className="primary" type="submit" disabled={saving}>Log weight</button>
        <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export function DayRail({
  view, targets, tombstones, onAddFood, onAgain, onChanged, onPendingClick, run, loading,
}: {
  view: DayView;
  targets: Targets;
  tombstones: string[];
  onAddFood: () => void;
  onAgain: (row: FoodRow) => void;
  onChanged: (message: string, staged?: boolean) => void;
  onPendingClick: () => void;
  run: (collection: never, command: string, values: Record<string, string | boolean>) => Promise<{ ok: boolean; text: string }>;
  loading: boolean;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [addingWeight, setAddingWeight] = useState(false);

  const unpushed = view.food.filter((row) => row.state !== "synced").length
    + view.weights.filter((row) => row.state !== "synced").length;
  const isToday = view.day === view.today;
  const recent = [...view.food].reverse().slice(0, 5);

  return (
    <aside className="rail" aria-label="Selected day" aria-busy={loading}>
      <div className="rail-head">
        <h2>{parseDay(view.day).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</h2>
        <span className="rel">{relativeDay(view.day, view.today)}</span>
        {unpushed > 0 && (
          <button className="chip" type="button" onClick={onPendingClick}>{unpushed} unpushed</button>
        )}
      </div>

      {view.broken.length > 0 && (
        <div className="errorcard">
          <div>Unreadable files block syncing for this collection.</div>
          <pre>{view.broken.join("\n")}</pre>
        </div>
      )}

      <Totals totals={view.totals} count={view.food.length} target={targets.daily_kcal} />

      <div className="section">
        <div className="section-head"><span>Weight</span></div>
        {view.weights.map((point, index) => {
          const previous = index > 0 ? view.weights[index - 1]!.value : null;
          const delta = previous === null ? null : (point.value - previous).toFixed(1);
          return (
            <Row
              key={point.path}
              kind="weight"
              record={point}
              title={`${num(point.value, 1)} ${point.unit}`}
              meta={[clock(point.time), delta ? `${Number(delta) > 0 ? "+" : ""}${delta}` : null, point.remote_note]
                .filter(Boolean).join(" · ")}
              open={open}
              setOpen={setOpen}
              onChanged={onChanged}
            />
          );
        })}
        {addingWeight ? (
          <WeightForm
            day={view.day}
            isToday={isToday}
            unit={view.weight_unit}
            onCancel={() => setAddingWeight(false)}
            onLogged={() => { setAddingWeight(false); onChanged("Weight logged"); }}
            run={run as never}
          />
        ) : (
          <button className="ghost-row" type="button" onClick={() => setAddingWeight(true)}>
            <IconAdd size={14} aria-hidden focusable="false" />Add weight
          </button>
        )}
      </div>

      {view.food.length === 0 && <div className="note">Nothing logged.</div>}

      {MEALS.map((meal) => {
        const rows = view.food.filter((row) => row.meal === meal);
        if (rows.length === 0) return null;
        const subtotal = rows.reduce((sum, row) => sum + Number(row.kcal || 0), 0);
        return (
          <div className="section" key={meal}>
            <div className="section-head">
              <span>{MEAL_NAME[meal] ?? meal}</span>
              <span>{num(subtotal)}</span>
            </div>
            {rows.map((row) => (
              <Row
                key={row.path}
                kind="food"
                record={row}
                title={row.name}
                meta={[
                  `${row.amount} ${row.unit}`,
                  [row.protein ? `P ${num(row.protein, 1)}` : null,
                   row.carbs ? `C ${num(row.carbs, 1)}` : null,
                   row.fat ? `F ${num(row.fat, 1)}` : null].filter(Boolean).join(" "),
                  clock(row.time),
                ].filter(Boolean).join(" · ")}
                figure={num(row.kcal)}
                open={open}
                setOpen={setOpen}
                onAgain={() => onAgain(row)}
                onChanged={onChanged}
              />
            ))}
          </div>
        );
      })}

      {tombstones.map((name) => (
        <div className="tombstone" key={name}>
          <span>{name} — deleted, goes on next push</span>
        </div>
      ))}

      <div className="rail-foot">
        <button className="primary" type="button" onClick={onAddFood}>
          <IconAdd aria-hidden focusable="false" />Add food
        </button>
        {recent.length > 0 && (
          <div className="again">
            {recent.map((row, index) => (
              <button
                key={row.path}
                className="again-chip"
                type="button"
                title={`Log ${row.name} again`}
                onClick={() => onAgain(row)}
              >
                <kbd>{index + 1}</kbd>{`${row.name} · ${num(row.kcal)}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
