import type { MonthCell, MonthView, Targets } from "../lib/types";
import { num, shiftDay } from "../lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Cell({ day, cell, today, selected, target, compact, onSelect }: {
  day: string;
  cell: MonthCell | undefined;
  today: string;
  selected: string | null;
  target: number | null;
  compact: boolean;
  onSelect: (day: string) => void;
}) {
  const classes = ["cell"];
  if (day === today) classes.push("today");
  if (day === selected) classes.push("selected");
  if (day > today) classes.push("future");
  if (!cell) classes.push("empty");

  const hasFood = Boolean(cell && cell.entries > 0);
  const ratio = hasFood && target ? Number(cell!.kcal) / target : 0;
  const worst = cell?.worst ?? null;
  const attention = worst !== null && worst !== "new" && worst !== "edited";
  const pendingCount = cell ? Object.values(cell.states).reduce((a, b) => a + b, 0) : 0;
  const delta = cell?.weight?.delta;

  return (
    <button
      type="button"
      className={classes.join(" ")}
      aria-current={day === selected ? "date" : undefined}
      aria-label={[
        new Date(`${day}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "long" }),
        hasFood ? `${cell!.kcal} calories` : "nothing logged",
        cell?.weight ? `${cell.weight.value}` : null,
      ].filter(Boolean).join(". ")}
      onClick={() => onSelect(day)}
    >
      <span className="cell-day">{Number(day.slice(8))}</span>
      {cell && (
        <>
          <span className={`cell-kcal${hasFood ? "" : " cell-missing"}`}>
            {hasFood ? num(cell.kcal) : "—"}
          </span>
          {!compact && (
            <span className="cell-protein">{hasFood ? `P ${num(cell.protein)}` : ""}</span>
          )}
          {!compact && cell.weight && (
            <span className="cell-weight">
              {cell.weight.value}
              {/* A signed number carries direction AND magnitude in the space an
                  arrow would take, and does not read as a nested control inside
                  a cell that is itself a button. U+2212 so signs align. */}
              {delta !== null && delta !== undefined && delta !== 0 && (
                <i>{delta > 0 ? "+" : "−"}{Math.abs(delta).toFixed(1)}</i>
              )}
            </span>
          )}
          {ratio > 0 && (
            <div className="cell-bar">
              <b style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
              {ratio > 1 && (
                <b className="over" style={{ width: `${Math.min(ratio - 1, 1) * 100}%` }} />
              )}
            </div>
          )}
          {worst && (
            <span
              className={`cell-state ${attention ? "attention" : "pending"}`}
              title={`${pendingCount} ${attention ? "needing attention" : "unpushed"}`}
            />
          )}
        </>
      )}
    </button>
  );
}

export function Calendar({ view, selected, targets, onSelect, compact = false }: {
  view: MonthView;
  selected: string | null;
  targets: Targets;
  onSelect: (day: string) => void;
  compact?: boolean;
}) {
  const days: string[] = [];
  for (let i = 0; i < 42; i++) days.push(shiftDay(view.grid_start, i));

  // Drop a trailing week the month never reaches into.
  const cells = days.map((day) => (day < view.first || day > view.last ? null : day));
  if (cells.slice(35).every((day) => day === null)) cells.length = 35;

  return (
    <section className={`calendar${compact ? " compact" : ""}`} aria-label={`Calendar, ${view.label}`}>
      <div className="weekdays">
        {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
      </div>
      <div className="grid">
        {cells.map((day, index) =>
          day === null
            ? <div className="cell blank" key={`blank-${index}`} />
            : (
              <Cell
                key={day}
                day={day}
                cell={view.days[day]}
                today={view.today}
                selected={selected}
                target={targets.daily_kcal}
                compact={compact}
                onSelect={onSelect}
              />
            ),
        )}
      </div>
    </section>
  );
}
