import { useState } from "react";
import { AppleActivityCard } from "@/components/ui/apple-activity-ring";
import { MEALS, MEAL_NAME, clock, num, parseDay, shiftDay } from "../lib/format";
import { budget } from "../lib/budget";
import type { DayView, FoodRow, Kind, Targets, WeightRow } from "../lib/types";
import { DeleteConfirm, EditRecord } from "./EditRecord";
import { Dialog } from "./Dialog";
import {
  IconAgain,
  IconBurned,
  IconCatalogue,
  IconDelete,
  IconEdit,
  IconFood,
  IconWeight,
} from "../lib/icons";

type RecordAction = {
  mode: "edit" | "delete";
  kind: Kind;
  record: FoodRow | WeightRow;
  title: string;
};

function Nutrition({
  view,
  targets,
  pending,
  onSync,
}: {
  view: DayView;
  targets: Targets;
  pending: number;
  onSync: () => void;
}) {
  const { totals } = view;
  // Energy is measured against what Google says was burned that day, not a
  // fixed goal. Today's burn is still accumulating, so the ring is too.
  const burnedKcal = view.burned?.kcal ?? null;
  const proteinTarget = targets.daily_protein_g;
  const kcalRatio = burnedKcal ? totals.kcal / burnedKcal : null;
  const proteinRatio = proteinTarget ? totals.protein / proteinTarget : null;
  const energy = {
    protein: totals.protein * 4,
    carbs: totals.carbs * 4,
    fat: totals.fat * 9,
  };
  const energyTotal = energy.protein + energy.carbs + energy.fat;
  const share = (value: number) =>
    energyTotal > 0 ? (value / energyTotal) * 100 : 0;
  return (
    <section className="tile tile-nutrition" aria-label="Nutrition for selected day">
      <header className="tile-head">
        <h2>Nutrition</h2>
        <span>
          {view.food.length} {view.food.length === 1 ? "entry" : "entries"}
        </span>
      </header>
      <AppleActivityCard
        title={null}
        compact
        ringSize={132}
        strokeWidth={14}
        activities={[
          { label: "Energy", value: kcalRatio === null ? null : kcalRatio * 100,
            color: "var(--energy)", endColor: "#ff6b8b", size: 132,
            current: totals.kcal, target: burnedKcal, unit: "kcal burned" },
          { label: "Protein", value: proteinRatio === null ? null : proteinRatio * 100,
            color: "var(--protein)", endColor: "#9ee7ff", size: 98,
            current: totals.protein, target: proteinTarget, unit: "g" },
        ]}
      >
        <dl className="ring-legend">
          <div
            className={
              "energy" + (kcalRatio !== null && kcalRatio > 1 ? " over-target" : "")
            }
          >
            <dt>Energy</dt>
            <dd>
              <b>{num(totals.kcal) ?? "0"}</b>
              <span>{burnedKcal ? `/ ${num(burnedKcal)} kcal burned` : "kcal"}</span>
            </dd>
            <dd
              className={
                "ring-ratio" +
                (burnedKcal
                  ? " " +
                    budget(burnedKcal, totals.kcal, targets.daily_deficit_kcal ?? 0).state
                  : "")
              }
            >
              {kcalRatio === null
                ? "Burned not pulled yet"
                : `${Math.round(kcalRatio * 100)}% of burned${
                    view.day === view.today ? " so far" : ""
                  }`}
            </dd>
          </div>
          <div className="protein">
            <dt>Protein</dt>
            <dd>
              <b>{num(totals.protein, 1) ?? "0"}</b>
              <span>{proteinTarget ? `/ ${num(proteinTarget)} g` : "g"}</span>
            </dd>
            {proteinRatio !== null && (
              <dd className="ring-ratio">{Math.round(proteinRatio * 100)}% of target</dd>
            )}
          </div>
        </dl>
      </AppleActivityCard>
      <div className="macro-split">
        <div
          className="macro-bar"
          role="img"
          aria-label="Share of energy from protein, carbs and fat"
        >
          {energyTotal > 0 && (
            <>
              <i className="protein" style={{ width: share(energy.protein) + "%" }} />
              <i className="carbs" style={{ width: share(energy.carbs) + "%" }} />
              <i className="fat" style={{ width: share(energy.fat) + "%" }} />
            </>
          )}
        </div>
        <dl className="macro-values">
          <div className="protein">
            <dt>Protein</dt>
            <dd>{num(totals.protein, 1) ?? "0"} g</dd>
          </div>
          <div className="carbs">
            <dt>Carbs</dt>
            <dd>{num(totals.carbs, 1) ?? "0"} g</dd>
          </div>
          <div className="fat">
            <dt>Fat</dt>
            <dd>{num(totals.fat, 1) ?? "0"} g</dd>
          </div>
          {totals.fiber > 0 && (
            <div>
              <dt>Fibre</dt>
              <dd>{num(totals.fiber, 1)} g</dd>
            </div>
          )}
          {totals.sugar > 0 && (
            <div>
              <dt>Sugar</dt>
              <dd>{num(totals.sugar, 1)} g</dd>
            </div>
          )}
        </dl>
      </div>
      {pending > 0 && (
        <button className="pending-notice" onClick={onSync}>
          {pending} {pending === 1 ? "record needs" : "records need"} syncing
          <span>Review</span>
        </button>
      )}
    </section>
  );
}

function FoodEntry({
  row,
  onEdit,
  onDelete,
  onReuse,
}: {
  row: FoodRow;
  onEdit: () => void;
  onDelete: () => void;
  onReuse: () => void;
}) {
  return (
    <article className="food-entry" aria-label={row.name}>
      <time className="food-entry-time" dateTime={row.time}>
        {clock(row.time)}
      </time>
      <div className="food-entry-body">
        <h4>
          {row.identified && (
            <IconCatalogue size={13} aria-label="Google catalog food" />
          )}
          {row.name}
        </h4>
        <p>
          <span>
            {row.amount} {row.unit}
          </span>
          <span className="protein">P {num(row.protein, 1) ?? "?"}</span>
          <span className="carbs">C {num(row.carbs, 1) ?? "?"}</span>
          <span className="fat">F {num(row.fat, 1) ?? "?"}</span>
          {row.state !== "synced" && (
            <span className="record-state">{row.state}</span>
          )}
        </p>
      </div>
      <div className="food-entry-energy">
        {num(row.kcal)}
        <span>kcal</span>
      </div>
      <div className="record-actions">
        <button className="icon" aria-label={"Edit " + row.name} title="Edit" onClick={onEdit}>
          <IconEdit aria-hidden />
        </button>
        <button className="icon" aria-label={"Reuse " + row.name} title="Reuse" onClick={onReuse}>
          <IconAgain aria-hidden />
        </button>
        <button
          className="icon danger"
          aria-label={"Delete " + row.name}
          title="Delete"
          onClick={onDelete}
        >
          <IconDelete aria-hidden />
        </button>
      </div>
    </article>
  );
}

/**
 * This day's first reading against the first reading of the previous weigh-in
 * day. Down is green and up is red, since the deficit goal is to lose.
 */
function WeightChange({ view, value }: { view: DayView; value: number }) {
  const previous = view.previous_weight;
  if (!previous) return null;
  const change = Number((value - previous.value).toFixed(1));
  const when =
    previous.day === shiftDay(view.day, -1)
      ? "yesterday"
      : parseDay(previous.day).toLocaleDateString([], { month: "short", day: "numeric" });
  const unit = view.weight_unit;
  return (
    <span className={"delta " + (change < 0 ? "good" : change > 0 ? "bad" : "flat")}>
      {change === 0
        ? `No change vs ${when}`
        : `${change > 0 ? "+" : "\u2212"}${Math.abs(change).toFixed(1)} ${unit} vs ${when}`}
    </span>
  );
}

/** Calories left for the day, coloured by the shared budget rule. */
function BudgetLeft({ view, deficit }: { view: DayView; deficit: number }) {
  if (!view.burned) return null;
  const { left, state } = budget(view.burned.kcal, view.totals.kcal, deficit);
  const today = view.day === view.today;
  const text =
    view.totals.kcal === 0
      ? `${num(Math.max(left, 0))} kcal to eat`
      : left < 0
        ? `${num(-left)} kcal over budget`
        : today
          ? `${num(left)} kcal left`
          : `${num(left)} kcal under budget`;
  return (
    <span className={"delta " + (state === "over" ? "bad" : state === "closing" ? "warn" : "good")}>
      {text}
      {deficit > 0 && <span className="delta-note"> after {num(deficit)} deficit</span>}
    </span>
  );
}

/** Everything recorded on the selected day: totals, weight, burned, meals. */
export function Day({
  view,
  targets,
  loading,
  onAddFood,
  onAddWeight,
  onReuse,
  onChanged,
  onSync,
}: {
  view: DayView;
  targets: Targets;
  loading: boolean;
  onAddFood: () => void;
  onAddWeight: () => void;
  onReuse: (row: FoodRow) => void;
  onChanged: (message: string) => void;
  onSync: () => void;
}) {
  const [action, setAction] = useState<RecordAction | null>(null);
  const pending = [...view.food, ...view.weights].filter(
    (row) => row.state !== "synced",
  ).length;
  const meals = [
    ...MEALS,
    ...new Set(
      view.food
        .map((row) => row.meal)
        .filter((meal) => !MEALS.includes(meal as (typeof MEALS)[number])),
    ),
  ];
  return (
    <>
      {view.broken.length > 0 && (
        <div className="errorcard" role="alert">
          <p>Some records could not be read.</p>
          <pre>{view.broken.join("\n")}</pre>
        </div>
      )}
      <div className="day" aria-busy={loading} inert={loading}>
        <Nutrition view={view} targets={targets} pending={pending} onSync={onSync} />
        <div className="tile-pair">
          <section className="tile tile-weight" aria-label="Weight for selected day">
            <header className="tile-head">
              <h2>
                <IconWeight size={15} aria-hidden />
                Weight
              </h2>
              <button className="text-action" onClick={onAddWeight}>
                Log weight
              </button>
            </header>
            {view.weights.length === 0 ? (
              <p className="tile-empty">No weigh-in</p>
            ) : (
              view.weights.map((point, index) => (
                <div className="reading" key={point.path}>
                  <strong>
                    {num(point.value, 1)}
                    <small> {point.unit}</small>
                  </strong>
                  {index === 0 && <WeightChange view={view} value={point.value} />}
                  <span className="reading-meta">
                    {clock(point.time)}
                    {point.state !== "synced" && (
                      <span className="record-state">{point.state}</span>
                    )}
                  </span>
                  {point.remote_note && <p>{point.remote_note}</p>}
                  <div className="record-actions">
                    <button
                      className="icon"
                      aria-label={"Edit weight at " + clock(point.time)}
                      title="Edit"
                      onClick={() =>
                        setAction({ mode: "edit", kind: "weight", record: point, title: "Weight" })
                      }
                    >
                      <IconEdit aria-hidden />
                    </button>
                    <button
                      className="icon danger"
                      aria-label={"Delete weight at " + clock(point.time)}
                      title="Delete"
                      onClick={() =>
                        setAction({ mode: "delete", kind: "weight", record: point, title: "Weight" })
                      }
                    >
                      <IconDelete aria-hidden />
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
          <section className="tile tile-burned" aria-label="Calories burned for selected day">
            <header className="tile-head">
              <h2>
                <IconBurned size={15} aria-hidden />
                Burned
              </h2>
              <span>Google Health</span>
            </header>
            {view.burned ? (
              <div className="reading">
                <strong>
                  {num(view.burned.kcal)}
                  <small> kcal</small>
                </strong>
                <BudgetLeft view={view} deficit={targets.daily_deficit_kcal ?? 0} />
                <span className="reading-meta">
                  {view.day === view.today ? "So far, updated " : "Updated "}
                  {view.burned.fetched.slice(0, 10) === view.day
                    ? clock(view.burned.fetched)
                    : view.burned.fetched.slice(5, 10) + " " + clock(view.burned.fetched)}
                </span>
              </div>
            ) : (
              <p className="tile-empty">Not pulled yet</p>
            )}
          </section>
        </div>
        <section className="tile meal-log" aria-label="Meals for selected day">
          <header className="tile-head">
            <h2>Food log</h2>
            <span>Per portion</span>
          </header>
          {view.food.length === 0 ? (
            <div className="empty-day">
              <IconFood size={26} aria-hidden />
              <h3>No food logged for this day.</h3>
              <p>Add a meal or reuse one you’ve logged before.</p>
              <button className="primary" onClick={onAddFood}>
                Log food
              </button>
            </div>
          ) : (
            meals.map((meal) => {
              const rows = view.food.filter((row) => row.meal === meal);
              if (!rows.length) return null;
              return (
                <section className="meal-group" key={meal} aria-label={MEAL_NAME[meal] ?? meal}>
                  <div className="meal-heading">
                    <h3>{MEAL_NAME[meal] ?? meal}</h3>
                    <span>{num(rows.reduce((sum, row) => sum + row.kcal, 0))} kcal</span>
                  </div>
                  {rows.map((row) => (
                    <FoodEntry
                      key={row.path}
                      row={row}
                      onEdit={() =>
                        setAction({ mode: "edit", kind: "food", record: row, title: row.name })
                      }
                      onDelete={() =>
                        setAction({ mode: "delete", kind: "food", record: row, title: row.name })
                      }
                      onReuse={() => onReuse(row)}
                    />
                  ))}
                </section>
              );
            })
          )}
        </section>
      </div>
      {action && (
        <Dialog
          title={(action.mode === "edit" ? "Edit " : "Delete ") + action.kind}
          onClose={() => setAction(null)}
        >
          <p className="record-date">
            {parseDay(action.record.day).toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {action.mode === "edit" ? (
            <EditRecord
              kind={action.kind}
              record={action.record}
              onCancel={() => setAction(null)}
              onDone={(message) => {
                setAction(null);
                onChanged(message);
              }}
            />
          ) : (
            <DeleteConfirm
              kind={action.kind}
              record={action.record}
              title={action.title}
              onCancel={() => setAction(null)}
              onDone={(message) => {
                setAction(null);
                onChanged(message);
              }}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
