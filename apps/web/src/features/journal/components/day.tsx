import { Surface } from "@/design-system/primitives/surface";
import { Badge } from "@/design-system/primitives/badge";
import { IconButton } from "@/design-system/primitives/icon-button";
import { cn } from "@/design-system/lib/cn";
import { Button } from "@/design-system/primitives/button";
import { useState } from "react";
import { NutritionGauge } from "@/features/journal/components/nutrition-gauge";
import { MEALS, MEAL_NAME, clock, num, parseDay, shiftDay } from "@/lib/format";
import { budget } from "@/lib/budget";
import type { DayView, FoodRow, Kind, Targets, WeightRow } from "@/lib/types";
import { EditRecord } from "@/features/journal/components/edit-record";
import { DeleteConfirm } from "@/features/journal/components/delete-confirm";
import { Dialog } from "@/design-system/patterns/dialog";
import {
  IconAgain,
  IconBurned,
  IconCatalogue,
  IconDelete,
  IconEdit,
  IconFood,
  IconWeight,
} from "@/design-system/foundations/icons";

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
  const energy = {
    protein: totals.protein * 4,
    carbs: totals.carbs * 4,
    fat: totals.fat * 9,
  };
  const total = energy.protein + energy.carbs + energy.fat;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  return (
    <Surface
      className="shadow-none tile tile-nutrition col-span-full "
      aria-label="Nutrition for selected day"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-6 max-[521px]:px-5">
        <h2 className="text-ui-title">Daily nutrition</h2>
        <span className="text-ui-label text-muted-foreground">
          {view.food.length} {view.food.length === 1 ? "entry" : "entries"}{" "}
          logged
        </span>
      </header>
      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(230px,1fr)] items-center gap-10 p-6 max-[761px]:grid-cols-1 max-[761px]:gap-7 max-[521px]:p-5">
        <NutritionGauge
          consumed={totals.kcal}
          energyTarget={targets.daily_kcal}
        />
        <div className="macro-split min-w-0 border-0 border-l border-solid border-border pl-8 max-[761px]:border-l-0 max-[761px]:border-t max-[761px]:pl-0 max-[761px]:pt-5">
          <h3 className="mb-1 text-[14px]">Your macros</h3>
          <p className="mb-5 text-ui-label leading-5 text-muted-foreground">
            Totals for the portions you logged.
          </p>
          <dl className="m-0 grid gap-3 text-ui-body">
            {(
              [
                ["Protein", totals.protein, "var(--ds-color-protein)"],
                ["Carbs", totals.carbs, "var(--ds-color-carbs)"],
                ["Fat", totals.fat, "var(--ds-color-fat)"],
              ] as const
            ).map(([label, grams, color]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: color }}
                    aria-hidden
                  />
                  {label}
                </dt>
                <dd className="m-0 font-semibold tabular-nums">
                  {num(grams, 1)}{" "}
                  <span className="font-normal text-muted-foreground">g</span>
                </dd>
              </div>
            ))}
          </dl>
          <div
            className="macro-bar mt-5 flex h-2 gap-1 overflow-hidden rounded-capsule"
            aria-hidden
          >
            <i
              className="bg-protein"
              style={{ width: share(energy.protein) + "%" }}
            />
            <i
              className="bg-carbs"
              style={{ width: share(energy.carbs) + "%" }}
            />
            <i className="bg-fat" style={{ width: share(energy.fat) + "%" }} />
          </div>
          <p className="mt-3 text-ui-caption leading-5 text-subtle">
            Calories eaten are compared with your configured daily target.
          </p>
        </div>
      </div>
      {pending > 0 && (
        <button
          className="pending-notice mx-4 mb-4 flex min-h-11 w-[calc(100%_-_32px)] items-center justify-between gap-3 rounded-lg border-0 bg-warning-muted px-4 text-left text-ui-body text-warning"
          onClick={onSync}
        >
          <span>
            {pending} {pending === 1 ? "record needs" : "records need"} syncing
          </span>
          <span className="font-semibold">Review</span>
        </button>
      )}
    </Surface>
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
    <article
      className="food-entry grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 border-0 border-b border-solid border-border px-6 py-5 last:border-b-0 max-[521px]:px-5"
      aria-label={row.name}
    >
      <div className="food-entry-body min-w-0">
        <button
          className="mb-1.5 block min-h-6 max-w-full rounded-[5px] border-0 bg-transparent p-0 text-left text-ui-subheading font-semibold leading-6 text-foreground pointer-hover:hover:underline"
          aria-label={"Edit " + row.name}
          onClick={onEdit}
        >
          {row.identified && (
            <IconCatalogue
              size={14}
              className="mr-1.5 inline-block align-middle text-subtle"
              aria-label="Google catalog food"
            />
          )}
          <span className="wrap-anywhere">{row.name}</span>
        </button>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-ui-label leading-5 text-muted-foreground">
          <span>
            {row.amount} {row.unit}
          </span>
          <time dateTime={row.time}>{clock(row.time)}</time>
          {row.state !== "synced" && (
            <Badge tone="warning" className="record-state text-ui-label">
              {row.state}
            </Badge>
          )}
        </p>
      </div>
      <div className="food-entry-energy text-right text-[20px] font-semibold tabular-nums tracking-[-0.02em]">
        {num(row.kcal)}
        <span className="block text-ui-caption font-normal tracking-normal text-subtle">
          kcal
        </span>
      </div>
      <div className="col-span-full flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-ui-detail leading-5 text-muted-foreground">
          <span className="protein">
            Protein {num(row.protein, 1) ?? "?"} g
          </span>
          <span className="carbs">Carbs {num(row.carbs, 1) ?? "?"} g</span>
          <span className="fat">Fat {num(row.fat, 1) ?? "?"} g</span>
        </p>
        <div className="record-actions flex items-center gap-1">
          <Button
            variant="secondary"
            className="min-h-9 px-3 text-ui-label max-[761px]:min-h-11"
            aria-label={"Reuse " + row.name}
            onClick={onReuse}
          >
            <IconAgain size={14} aria-hidden />
            Repeat
          </Button>
          <details
            className="relative"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                event.currentTarget.open = false;
            }}
          >
            <summary
              className="flex min-h-11 cursor-pointer list-none items-center rounded-capsule px-3 text-ui-label text-muted-foreground marker:[content:'']"
              aria-label={"More actions for " + row.name}
            >
              More
            </summary>
            <div className="absolute right-0 top-full z-10 min-w-[140px] rounded-lg border border-solid border-input bg-popover p-1 shadow-lg">
              <Button
                variant="danger"
                className=" w-full justify-start border-0 bg-transparent px-3"
                aria-label={"Delete " + row.name}
                onClick={(event) => {
                  const disclosure = event.currentTarget.closest("details");
                  disclosure?.removeAttribute("open");
                  disclosure?.querySelector("summary")?.focus();
                  onDelete();
                }}
              >
                <IconDelete size={14} aria-hidden />
                Delete
              </Button>
            </div>
          </details>
        </div>
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
      : parseDay(previous.day).toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
  const unit = view.weight_unit;
  return (
    <span
      className={
        "delta col-start-1 text-ui-label font-semibold [&.good]:[color:var(--ds-color-positive)] [&.warn]:[color:var(--ds-color-caution)] [&.bad]:text-over [&.flat]:text-muted-foreground " +
        (change < 0 ? "good" : change > 0 ? "bad" : "flat")
      }
    >
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
    <span
      className={
        "delta col-start-1 text-ui-label font-semibold [&.good]:[color:var(--ds-color-positive)] [&.warn]:[color:var(--ds-color-caution)] [&.bad]:text-over [&.flat]:text-muted-foreground " +
        (state === "over" ? "bad" : state === "closing" ? "warn" : "good")
      }
    >
      {text}
      {deficit > 0 && (
        <span className="delta-note text-subtle font-normal">
          {" "}
          after {num(deficit)} deficit
        </span>
      )}
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
        <div
          className={cn(
            "errorcard border border-solid border-[var(--ds-color-warning-border)] bg-warning-muted rounded-tile p-5.5",
            "grid gap-3.5 text-ui-body [&_h2]:text-[16px] [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
            "[&_pre]:[font:11.5px/1.6_var(--ds-font-code)] [&_pre]:text-muted-foreground [&_.secondary]:justify-self-start",
          )}
          role="alert"
        >
          <p>Some records could not be read.</p>
          <pre>{view.broken.join("\n")}</pre>
        </div>
      )}
      <div
        className={cn(
          "day grid grid-cols-[minmax(0,1fr)_300px] gap-5 items-start [transition:opacity_var(--ds-duration-normal)_ease] [&[aria-busy=true]]:opacity-[0.6]",
          "max-[961px]:grid-cols-[minmax(0,1fr)]",
        )}
        aria-busy={loading}
        inert={loading}
      >
        <Nutrition
          view={view}
          targets={targets}
          pending={pending}
          onSync={onSync}
        />
        <Surface
          className={cn("tile", "meal-log min-h-[300px] pb-2")}
          aria-label="Meals for selected day"
        >
          <header
            className={cn(
              "tile-head flex items-center justify-between gap-3 [padding:15px_18px_0] min-h-[42px] [&_h2]:flex",
              "[&_h2]:items-center [&_h2]:gap-[7px] [&_h2]:text-ui-body [&_h2]:tracking-[-0.005em] [&_>_span]:text-subtle",
              "[&_>_span]:text-ui-detail [&_h2]:whitespace-nowrap [&_>_span]:whitespace-nowrap",
              "[&_.text-action]:whitespace-nowrap",
            )}
          >
            <h2>Food log</h2>
            <span>
              {view.food.length} {view.food.length === 1 ? "entry" : "entries"}
            </span>
          </header>
          {view.food.length === 0 ? (
            <div
              className={cn(
                "empty-day grid justify-items-center gap-2 [padding:44px_24px_40px] text-center [&_svg]:text-subtle [&_svg]:mb-1",
                "[&_h3]:text-ui-subheading [&_p]:text-muted-foreground [&_p]:text-[12.5px] [&_p]:mb-2",
              )}
            >
              <IconFood size={26} aria-hidden />
              <h3>No food logged for this day.</h3>
              <p>Add a meal or reuse one you’ve logged before.</p>
              <Button variant="primary" onClick={onAddFood}>
                Log food
              </Button>
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
                  <div
                    className={cn(
                      "meal-heading flex justify-between items-baseline [padding:16px_18px_4px] [&_h3]:text-ui-label",
                      "[&_h3]:text-muted-foreground [&_>_span]:text-subtle [&_>_span]:text-ui-detail",
                    )}
                  >
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
        </Surface>
        <div
          className={cn(
            "tile-pair grid grid-cols-1 gap-5 max-[961px]:grid-cols-2 max-[521px]:grid-cols-1",
          )}
        >
          <Surface
            className={cn("tile", "tile-weight [&_h2_svg]:text-weight")}
            aria-label="Weight for selected day"
          >
            <header
              className={cn(
                "tile-head flex items-center justify-between gap-3 [padding:15px_18px_0] min-h-[42px] [&_h2]:flex",
                "[&_h2]:items-center [&_h2]:gap-[7px] [&_h2]:text-ui-body [&_h2]:tracking-[-0.005em] [&_>_span]:text-subtle",
                "[&_>_span]:text-ui-detail [&_h2]:whitespace-nowrap [&_>_span]:whitespace-nowrap",
                "[&_.text-action]:whitespace-nowrap",
              )}
            >
              <h2>
                <IconWeight size={15} aria-hidden />
                Weight
              </h2>
              <button
                className="text-action min-h-11 border-0 bg-none bg-transparent py-0.5 px-0 text-muted-foreground text-ui-label font-control pointer-hover:[&:hover]:text-foreground"
                onClick={onAddWeight}
              >
                Log weight
              </button>
            </header>
            {view.weights.length === 0 ? (
              <p className="tile-empty [padding:12px_18px_18px] text-subtle text-ui-body">
                No weigh-in
              </p>
            ) : (
              view.weights.map((point, index) => (
                <div
                  className={cn(
                    "reading grid grid-cols-[minmax(0,_1fr)_auto] items-start gap-y-0.5 gap-x-2 [padding:8px_18px_16px]",
                    "[&_+_.reading]:border-t [&_+_.reading]:[border-top-style:solid] [&_+_.reading]:border-t-border [&_+_.reading]:pt-3",
                    "[&_strong]:col-start-1 [&_strong]:[font:650_28px/1.1_var(--ds-font-numeric)] [&_strong]:tracking-[-0.02em]",
                    "[&_strong_small]:[font:500_13px_var(--ds-font-body)] [&_strong_small]:text-muted-foreground",
                    "[&_strong_small]:tracking-[0] [&_p]:col-span-full [&_p]:text-muted-foreground [&_p]:text-ui-label",
                    "[&_.record-actions]:col-start-2 [&_.record-actions]:row-start-1 [&_.record-actions]:self-center",
                    "max-[761px]:[&_strong]:whitespace-nowrap max-[761px]:[&_.record-actions]:col-start-1",
                    "max-[761px]:[&_.record-actions]:row-auto max-[761px]:[&_.record-actions]:[margin-left:-8px]",
                  )}
                  key={point.path}
                >
                  <strong>
                    {num(point.value, 1)}
                    <small> {point.unit}</small>
                  </strong>
                  {index === 0 && (
                    <WeightChange view={view} value={point.value} />
                  )}
                  <span className="reading-meta col-start-1 flex items-center gap-2 text-subtle text-ui-detail">
                    {clock(point.time)}
                    {point.state !== "synced" && (
                      <Badge
                        tone="warning"
                        className="record-state px-[7px] text-[10.5px] font-control leading-[18px]"
                      >
                        {point.state}
                      </Badge>
                    )}
                  </span>
                  {point.remote_note && <p>{point.remote_note}</p>}
                  <div className="record-actions flex gap-0.5">
                    <IconButton
                      size="compact"
                      aria-label={"Edit weight at " + clock(point.time)}
                      title="Edit"
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
                    </IconButton>
                    <IconButton
                      size="compact"
                      tone="danger"
                      aria-label={"Delete weight at " + clock(point.time)}
                      title="Delete"
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
                    </IconButton>
                  </div>
                </div>
              ))
            )}
          </Surface>
          <Surface
            className={cn(
              "tile",
              "tile-burned [&_h2_svg]:text-energy",
              "max-[761px]:[&_.tile-head_>_span]:hidden",
            )}
            aria-label="Calories burned for selected day"
          >
            <header
              className={cn(
                "tile-head flex items-center justify-between gap-3 [padding:15px_18px_0] min-h-[42px] [&_h2]:flex",
                "[&_h2]:items-center [&_h2]:gap-[7px] [&_h2]:text-ui-body [&_h2]:tracking-[-0.005em] [&_>_span]:text-subtle",
                "[&_>_span]:text-ui-detail [&_h2]:whitespace-nowrap [&_>_span]:whitespace-nowrap",
                "[&_.text-action]:whitespace-nowrap",
              )}
            >
              <h2>
                <IconBurned size={15} aria-hidden />
                Burned
              </h2>
              <span>Google Health</span>
            </header>
            {view.burned ? (
              <div
                className={cn(
                  "reading grid grid-cols-[minmax(0,_1fr)_auto] items-start gap-y-0.5 gap-x-2 [padding:8px_18px_16px]",
                  "[&_+_.reading]:border-t [&_+_.reading]:[border-top-style:solid] [&_+_.reading]:border-t-border [&_+_.reading]:pt-3",
                  "[&_strong]:col-start-1 [&_strong]:[font:650_28px/1.1_var(--ds-font-numeric)] [&_strong]:tracking-[-0.02em]",
                  "[&_strong_small]:[font:500_13px_var(--ds-font-body)] [&_strong_small]:text-muted-foreground",
                  "[&_strong_small]:tracking-[0] [&_p]:col-span-full [&_p]:text-muted-foreground [&_p]:text-ui-label",
                  "[&_.record-actions]:col-start-2 [&_.record-actions]:row-start-1 [&_.record-actions]:self-center",
                  "max-[761px]:[&_strong]:whitespace-nowrap max-[761px]:[&_.record-actions]:col-start-1",
                  "max-[761px]:[&_.record-actions]:row-auto max-[761px]:[&_.record-actions]:[margin-left:-8px]",
                )}
              >
                <strong>
                  {num(view.burned.kcal)}
                  <small> kcal</small>
                </strong>
                <BudgetLeft
                  view={view}
                  deficit={targets.daily_deficit_kcal ?? 0}
                />
                <span className="reading-meta col-start-1 flex items-center gap-2 text-subtle text-ui-detail">
                  {view.day === view.today ? "So far, updated " : "Updated "}
                  {view.burned.fetched.slice(0, 10) === view.day
                    ? clock(view.burned.fetched)
                    : view.burned.fetched.slice(5, 10) +
                      " " +
                      clock(view.burned.fetched)}
                </span>
              </div>
            ) : (
              <div className="grid gap-3 px-5 pb-5 pt-3">
                <p className="text-ui-body text-muted-foreground">
                  Not pulled yet. Download activity to see this day’s burn.
                </p>
                <Button
                  variant="secondary"
                  className="justify-self-start"
                  onClick={onSync}
                >
                  Open sync
                </Button>
              </div>
            )}
          </Surface>
        </div>
      </div>
      {action && (
        <Dialog
          title={(action.mode === "edit" ? "Edit " : "Delete ") + action.kind}
          onClose={() => setAction(null)}
        >
          <p className="record-date text-muted-foreground bg-popover py-3 px-6 border-b [border-bottom-style:solid] border-b-border text-ui-label max-[761px]:px-5">
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
