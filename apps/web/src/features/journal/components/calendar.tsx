import { cn } from "@/lib/utils";
import type { MonthCell, MonthView, Targets } from "@/lib/types";
import { num, shiftDay } from "@/lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Cell({
  day,
  cell,
  today,
  selected,
  target,
  compact,
  onSelect,
}: {
  day: string;
  cell: MonthCell | undefined;
  today: string;
  selected: string | null;
  target: number | null;
  compact: boolean;
  onSelect: (day: string) => void;
}) {
  const classes = ["cell relative h-14 border border-solid border-[transparent] rounded-[14px] bg-transparent text-foreground flex flex-col justify-center items-center gap-0.5 p-1 [&.today]:text-energy [&.today]:font-[650] [&.selected]:bg-primary [&.selected]:text-primary-foreground [&.future]:text-subtle [&.blank]:pointer-events-none [&.selected_.cell-kcal]:[color:#52525b] pointer-hover:[&:hover:not(.selected)]:bg-secondary max-[761px]:h-11.5 max-[761px]:rounded-[12px]"];
  if (day === today) classes.push("today");
  if (day === selected) classes.push("selected");
  if (day > today) classes.push("future");
  if (!cell) classes.push("empty");

  const hasFood = Boolean(cell && cell.entries > 0);
  const ratio = hasFood && target ? Number(cell!.kcal) / target : 0;
  const worst = cell?.worst ?? null;
  const attention = worst !== null && worst !== "new" && worst !== "edited";
  const pendingCount = cell
    ? Object.values(cell.states).reduce((a, b) => a + b, 0)
    : 0;
  const delta = cell?.weight?.delta;

  return (
    <button
      type="button"
      className={classes.join(" ")}
      aria-current={day === selected ? "date" : undefined}
      aria-label={[
        new Date(`${day}T12:00:00`).toLocaleDateString([], {
          day: "numeric",
          month: "long",
        }),
        hasFood ? `${cell!.kcal} calories` : "nothing logged",
        cell?.weight ? `${cell.weight.value}` : null,
      ]
        .filter(Boolean)
        .join(". ")}
      onClick={() => onSelect(day)}
    >
      <span className="cell-day text-[13px]">{Number(day.slice(8))}</span>
      {cell && (
        <>
          <span className={`cell-kcal text-[9.5px] text-subtle max-[761px]:text-[8px] ${hasFood ? "" : " cell-missing hidden"}`}>
            {hasFood ? num(cell.kcal) : "No food"}
          </span>
          {!compact && (
            <span className="cell-protein hidden">
              {hasFood ? `P ${num(cell.protein)}` : ""}
            </span>
          )}
          {!compact && cell.weight && (
            <span className="cell-weight hidden">
              {cell.weight.value}
              {/* A signed number carries direction AND magnitude in the space an
                  arrow would take, and does not read as a nested control inside
                  a cell that is itself a button. U+2212 so signs align. */}
              {delta !== null && delta !== undefined && delta !== 0 && (
                <i className={delta > 0 ? "up" : "down"}>
                  {delta > 0 ? "+" : "−"}
                  {Math.abs(delta).toFixed(1)}
                </i>
              )}
            </span>
          )}
          {ratio > 0 && (
            <div className="cell-bar absolute flex bottom-[5px] left-3 right-3 h-0.5 rounded-[2px] overflow-hidden [&_b]:bg-energy [&_b.over]:bg-over">
              <b style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
              {ratio > 1 && (
                <b
                  className="over"
                  style={{ width: `${Math.min(ratio - 1, 1) * 100}%` }}
                />
              )}
            </div>
          )}
          {worst && (
            <span
              className={`cell-state absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full bg-warning ${attention ? "attention" : "pending"}`}
              title={`${pendingCount} ${attention ? "needing attention" : "unpushed"}`}
            />
          )}
        </>
      )}
    </button>
  );
}

export function Calendar({
  view,
  selected,
  targets,
  onSelect,
  compact = false,
}: {
  view: MonthView;
  selected: string | null;
  targets: Targets;
  onSelect: (day: string) => void;
  compact?: boolean;
}) {
  const days: string[] = [];
  for (let i = 0; i < 42; i++) days.push(shiftDay(view.grid_start, i));

  // Drop a trailing week the month never reaches into.
  const cells = days.map((day) =>
    day < view.first || day > view.last ? null : day,
  );
  if (cells.slice(35).every((day) => day === null)) cells.length = 35;

  return (
    <section
      className={`calendar grid gap-1.5${compact ? " compact" : ""}`}
      aria-label={`Calendar, ${view.label}`}
    >
      <div className="weekdays grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-1 [&_span]:text-[10.5px] [&_span]:font-semibold [&_span]:text-subtle [&_span]:text-center">
        {WEEKDAYS.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="grid grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-1">
        {cells.map((day, index) =>
          day === null ? (
            <div className={cn(
              "cell relative h-14 border border-solid border-[transparent] rounded-[14px] bg-transparent text-foreground flex",
              "flex-col justify-center items-center gap-0.5 p-1 [&.today]:text-energy [&.today]:font-[650]",
              "[&.selected]:bg-primary [&.selected]:text-primary-foreground [&.future]:text-subtle",
              "[&.blank]:pointer-events-none [&.selected_.cell-kcal]:[color:#52525b]",
              "pointer-hover:[&:hover:not(.selected)]:bg-secondary max-[761px]:h-11.5 max-[761px]:rounded-[12px] blank"
            )} key={`blank-${index}`} />
          ) : (
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
