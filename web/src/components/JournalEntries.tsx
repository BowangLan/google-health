import { useState } from "react";
import { MEALS, MEAL_NAME, clock, num, parseDay } from "../lib/format";
import type { DayView, FoodRow, Kind, Targets, WeightRow } from "../lib/types";
import { DeleteConfirm, EditRecord } from "./EditRecord";
import { Dialog } from "./Dialog";
import {
  IconAgain,
  IconCatalogue,
  IconDelete,
  IconEdit,
  IconFood,
} from "../lib/icons";

type RecordAction = {
  mode: "edit" | "delete";
  kind: Kind;
  record: FoodRow | WeightRow;
  title: string;
};
function Totals({
  totals,
  count,
  target,
}: {
  totals: DayView["totals"];
  count: number;
  target: number | null;
}) {
  const ratio = target ? Number(totals.kcal) / target : 0;
  return (
    <div className={`totals${target && ratio > 1 ? " over-target" : ""}`}>
      <div className="totals-label">Energy logged</div>
      <div className="totals-kcal">
        {num(totals.kcal) ?? "0"}
        <span className="totals-unit"> kcal</span>
      </div>
      {target ? (
        <>
          <div className="totals-of">{`of ${num(target)} · ${Math.round(ratio * 100)}%`}</div>
          <div className="totals-bar">
            <b style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
            {ratio > 1 && (
              <b
                className="over"
                style={{ width: `${Math.min(ratio - 1, 1) * 100}%` }}
              />
            )}
          </div>
        </>
      ) : (
        <div className="totals-of">
          {count} {count === 1 ? "entry" : "entries"}
        </div>
      )}
      <div className="macros">
        <span className="protein">
          <span>Protein</span>
          <b>
            {num(totals.protein, 1) ?? "0"}
            <small> g</small>
          </b>
        </span>
        <span className="carbs">
          <span>Carbs</span>
          <b>
            {num(totals.carbs, 1) ?? "0"}
            <small> g</small>
          </b>
        </span>
        <span className="fat">
          <span>Fat</span>
          <b>
            {num(totals.fat, 1) ?? "0"}
            <small> g</small>
          </b>
        </span>
      </div>
      {(totals.fiber > 0 || totals.sugar > 0) && (
        <div className="other-nutrients">
          {totals.fiber > 0 && <span>Fibre {num(totals.fiber, 1)} g</span>}
          {totals.sugar > 0 && <span>Sugar {num(totals.sugar, 1)} g</span>}
        </div>
      )}
    </div>
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
      <div className="food-entry-time">{clock(row.time)}</div>
      <div className="food-entry-body">
        <h4>
          {row.identified && (
            <IconCatalogue size={14} aria-label="Google catalog food" />
          )}
          {row.name}
        </h4>
        <p>
          {row.amount} {row.unit}
          <span>Protein {num(row.protein, 1) ?? "?"} g</span>
          <span>Carbs {num(row.carbs, 1) ?? "?"} g</span>
          <span>Fat {num(row.fat, 1) ?? "?"} g</span>
        </p>
        <div className="record-actions">
          <button
            className="icon"
            aria-label={"Edit " + row.name}
            onClick={onEdit}
          >
            <IconEdit aria-hidden />
            Edit
          </button>
          <button
            className="icon"
            aria-label={"Reuse " + row.name}
            onClick={onReuse}
          >
            <IconAgain aria-hidden />
            Reuse
          </button>
          <button
            className="icon danger"
            aria-label={"Delete " + row.name}
            onClick={onDelete}
          >
            <IconDelete aria-hidden />
            Delete
          </button>
          {row.state !== "synced" && (
            <span className="record-state">{row.state}</span>
          )}
        </div>
      </div>
      <div className="food-entry-energy">
        {num(row.kcal)}
        <span>kcal</span>
      </div>
    </article>
  );
}

export function JournalEntries({
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
      <div className="journal-content" aria-busy={loading} inert={loading}>
        <aside className="daily-summary" aria-label="Summary for displayed day">
          <section className="surface nutrition-summary">
            <div className="surface-heading">
              <h2>Daily totals</h2>
              <span>{view.food.length} entries</span>
            </div>
            <Totals
              totals={view.totals}
              count={view.food.length}
              target={targets.daily_kcal}
            />
            {targets.daily_protein_g && (
              <p className="protein-target">
                {num(view.totals.protein, 1)} of {num(targets.daily_protein_g)}{" "}
                g protein target
              </p>
            )}
            {pending > 0 && (
              <button className="pending-notice" onClick={onSync}>
                {pending} records need syncing <span>Review sync</span>
              </button>
            )}
          </section>
          <section
            className="surface burned-summary"
            aria-label="Calories burned for displayed day"
          >
            <div className="surface-heading">
              <h2>Burned</h2>
              <span>Google Health</span>
            </div>
            {view.burned ? (
              <div className="weight-reading">
                <div>
                  <strong>
                    {num(view.burned.kcal)} <small>kcal</small>
                  </strong>
                  <span>
                    {view.day === view.today ? "so far · " : ""}updated{" "}
                    {view.burned.fetched.slice(0, 10) === view.day
                      ? clock(view.burned.fetched)
                      : view.burned.fetched.slice(5, 10) +
                        " " +
                        clock(view.burned.fetched)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="weight-empty">No calories burned pulled for this day.</p>
            )}
          </section>
          <section
            className="surface weight-summary"
            aria-label="Weight for displayed day"
          >
            <div className="surface-heading">
              <h2>Weight</h2>
              <button className="text-action" onClick={onAddWeight}>
                Log weight
              </button>
            </div>
            {view.weights.length === 0 ? (
              <p className="weight-empty">No weigh-in for this day.</p>
            ) : (
              view.weights.map((point) => (
                <div className="weight-reading" key={point.path}>
                  <div>
                    <strong>
                      {num(point.value, 1)} <small>{point.unit}</small>
                    </strong>
                    <span>{clock(point.time)}</span>
                  </div>
                  {point.remote_note && <p>{point.remote_note}</p>}
                  <div className="record-actions">
                    <button
                      className="icon"
                      aria-label={"Edit weight at " + clock(point.time)}
                      onClick={() =>
                        setAction({
                          mode: "edit",
                          kind: "weight",
                          record: point,
                          title: "Weight",
                        })
                      }
                    >
                      <IconEdit aria-hidden />
                      Edit
                    </button>
                    <button
                      className="icon danger"
                      aria-label={"Delete weight at " + clock(point.time)}
                      onClick={() =>
                        setAction({
                          mode: "delete",
                          kind: "weight",
                          record: point,
                          title: "Weight",
                        })
                      }
                    >
                      <IconDelete aria-hidden />
                      Delete
                    </button>
                    {point.state !== "synced" && (
                      <span className="record-state">{point.state}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        </aside>
        <section
          className="surface meal-log"
          aria-label="Meals for displayed day"
        >
          <div className="surface-heading">
            <h2>Food log</h2>
            <span>Calories and macros per portion</span>
          </div>
          {view.food.length === 0 ? (
            <div className="empty-journal">
              <IconFood size={28} aria-hidden />
              <h3>No food logged for this day.</h3>
              <p>Add a meal or choose a food you’ve logged before.</p>
              <button className="primary" onClick={onAddFood}>
                Log food
              </button>
            </div>
          ) : (
            meals.map((meal) => {
              const rows = view.food.filter((row) => row.meal === meal);
              if (!rows.length) return null;
              return (
                <section
                  className="meal-group"
                  key={meal}
                  aria-label={MEAL_NAME[meal] ?? meal}
                >
                  <div className="meal-heading">
                    <h3>{MEAL_NAME[meal] ?? meal}</h3>
                    <span>
                      {num(rows.reduce((sum, row) => sum + row.kcal, 0))} kcal
                    </span>
                  </div>
                  {rows.map((row) => (
                    <FoodEntry
                      key={row.path}
                      row={row}
                      onEdit={() =>
                        setAction({
                          mode: "edit",
                          kind: "food",
                          record: row,
                          title: row.name,
                        })
                      }
                      onDelete={() =>
                        setAction({
                          mode: "delete",
                          kind: "food",
                          record: row,
                          title: row.name,
                        })
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
