import { cn } from "@/lib/utils";
import { Button } from "@/components/button";
import { useState } from "react";
import { AppleActivityCard } from "@/components/ui/apple-activity-ring";
import { MEALS, MEAL_NAME, clock, num, parseDay, shiftDay } from "@/lib/format";
import { budget } from "@/lib/budget";
import type { DayView, FoodRow, Kind, Targets, WeightRow } from "@/lib/types";
import { EditRecord } from "@/features/journal/components/edit-record";
import { DeleteConfirm } from "@/features/journal/components/delete-confirm";
import { Dialog } from "@/components/dialog";
import {
  IconAgain,
  IconBurned,
  IconCatalogue,
  IconDelete,
  IconEdit,
  IconFood,
  IconWeight,
} from "@/lib/icons";

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
    <section className="tile min-w-0 bg-card border border-solid border-border rounded-[var(--r-tile)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.035)] tile-nutrition" aria-label="Nutrition for selected day">
      <header className={cn(
        "tile-head flex items-center justify-between gap-3 [padding:15px_18px_0] min-h-[42px] [&_h2]:flex",
        "[&_h2]:items-center [&_h2]:gap-[7px] [&_h2]:text-[13px] [&_h2]:tracking-[-0.005em] [&_>_span]:text-subtle",
        "[&_>_span]:text-[11.5px] [&_h2]:whitespace-nowrap [&_>_span]:whitespace-nowrap",
        "[&_.text-action]:whitespace-nowrap"
      )}>
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
          {
            label: "Energy", value: kcalRatio === null ? null : kcalRatio * 100,
            color: "var(--energy)", endColor: "#ff6b8b", size: 132,
            current: totals.kcal, target: burnedKcal, unit: "kcal burned"
          },
          {
            label: "Protein", value: proteinRatio === null ? null : proteinRatio * 100,
            color: "var(--protein)", endColor: "#9ee7ff", size: 98,
            current: totals.protein, target: proteinTarget, unit: "g"
          },
        ]}
      >
        <dl className={cn(
          "ring-legend grid gap-3.5 m-0 [&_>_div]:grid [&_>_div]:gap-[1px] [&_dt]:text-[12px] [&_dt]:font-semibold",
          "[&_.energy_dt]:text-energy [&_.protein_dt]:text-protein [&_dd]:m-0 [&_dd]:flex [&_dd]:items-baseline",
          "[&_dd]:gap-[5px] [&_b]:[font:650_26px/1.1_var(--rounded)] [&_b]:tracking-[-0.02em]",
          "[&_dd_span]:text-muted-foreground [&_dd_span]:text-[13px] [&_.ring-ratio]:text-subtle",
          "[&_.ring-ratio]:text-[11.5px] [&_.ring-ratio.ok]:[color:#30d158] [&_.ring-ratio.closing]:[color:#ffd60a]",
          "[&_.ring-ratio.over]:text-over max-[761px]:[&_b]:text-[23px] max-[381px]:w-full",
          "max-[381px]:grid-cols-[repeat(2,_minmax(0,_1fr))]"
        )}>
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
                : `${Math.round(kcalRatio * 100)}% of burned${view.day === view.today ? " so far" : ""
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
      <div className="macro-split grid gap-2.5 [padding:10px_18px_18px]">
        <div
          className={cn(
            "macro-bar flex gap-0.5 h-1.5 rounded-full overflow-hidden [&_i]:block [&_i]:rounded-full",
            "[&_i]:[transition:width_var(--spring-time)_var(--spring)] [&_.protein]:bg-protein [&_.carbs]:bg-carbs",
            "[&_.fat]:bg-fat"
          )}
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
        <dl className={cn(
          "macro-values flex flex-wrap gap-y-1 gap-x-4.5 m-0 text-[12px] [&_>_div]:flex [&_>_div]:gap-1.5",
          "[&_dt]:text-subtle [&_.protein_dt]:text-protein [&_.carbs_dt]:text-carbs [&_.fat_dt]:text-fat [&_dd]:m-0",
          "[&_dd]:text-foreground"
        )}>
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
        <button className={cn(
          "pending-notice flex justify-between items-center w-[calc(100%_-_24px)] [margin:0_12px_12px] py-2.5 px-3.5",
          "border-0 rounded-[14px] bg-warning-muted text-warning text-[12px] font-[590] text-left [&_span]:text-foreground"
        )} onClick={onSync}>
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
    <article className={cn(
      "food-entry relative grid grid-cols-[42px_minmax(0,_1fr)_auto_auto] items-center gap-2.5 my-0 mx-1.5 py-[9px]",
      "px-3 rounded-[14px] [&_+_.food-entry::before]:[content:''] [&_+_.food-entry::before]:absolute",
      "[&_+_.food-entry::before]:top-0 [&_+_.food-entry::before]:left-16 [&_+_.food-entry::before]:right-3",
      "[&_+_.food-entry::before]:border-t [&_+_.food-entry::before]:[border-top-style:solid]",
      "[&_+_.food-entry::before]:border-t-border pointer-hover:[&:hover]:bg-popover",
      "pointer-hover:[&:hover::before]:opacity-[0] pointer-hover:[&:hover_+_.food-entry::before]:opacity-[0]",
      "pointer-hover:[&_.record-actions]:opacity-[0] pointer-hover:[&:hover_.record-actions]:opacity-[1]",
      "pointer-hover:[&:focus-within_.record-actions]:opacity-[1] [&_.record-actions]:[transition:opacity_140ms_ease]",
      "max-[761px]:grid-cols-[minmax(0,_1fr)_auto] max-[761px]:gap-y-0.5 max-[761px]:gap-x-2.5 max-[761px]:py-2.5",
      "max-[761px]:px-3 max-[761px]:[&_+_.food-entry::before]:left-3 max-[761px]:[&_.record-actions]:col-span-full",
      "max-[761px]:[&_.record-actions]:[margin-left:-8px]"
    )} aria-label={row.name}>
      <time className="food-entry-time text-subtle text-[11.5px] max-[761px]:col-span-full max-[761px]:text-[11px]" dateTime={row.time}>
        {clock(row.time)}
      </time>
      <div className={cn(
        "food-entry-body min-w-0 [&_h4]:flex [&_h4]:items-center [&_h4]:gap-1.5 [&_h4]:text-[13px] [&_h4]:font-[560]",
        "[&_h4]:wrap-anywhere [&_h4_svg]:text-subtle [&_>_p]:flex [&_>_p]:flex-wrap [&_>_p]:items-center",
        "[&_>_p]:gap-y-0.5 [&_>_p]:gap-x-2.5 [&_>_p]:mt-0.5 [&_>_p]:text-subtle [&_>_p]:text-[11.5px]",
        "[&_.protein]:[color:color-mix(in_srgb,_var(--protein)_75%,_var(--text-3))]",
        "[&_.carbs]:[color:color-mix(in_srgb,_var(--carbs)_75%,_var(--text-3))]",
        "[&_.fat]:[color:color-mix(in_srgb,_var(--fat)_70%,_var(--text-3))]"
      )}>
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
            <span className="record-state inline-flex items-center rounded-full py-0 px-[7px] bg-warning-muted text-warning text-[10.5px] font-[590] leading-[18px]">{row.state}</span>
          )}
        </p>
      </div>
      <div className="food-entry-energy [font:600_14px_var(--rounded)] text-right [&_>_span]:block [&_>_span]:[font:400_10.5px_var(--sans)] [&_>_span]:text-subtle">
        {num(row.kcal)}
        <span>kcal</span>
      </div>
      <div className="record-actions flex gap-0.5">
        <Button variant="icon" aria-label={"Edit " + row.name} title="Edit" onClick={onEdit}>
          <IconEdit aria-hidden />
        </Button>
        <Button variant="icon" aria-label={"Reuse " + row.name} title="Reuse" onClick={onReuse}>
          <IconAgain aria-hidden />
        </Button>
        <Button
          variant="icon" className="danger"
          aria-label={"Delete " + row.name}
          title="Delete"
          onClick={onDelete}
        >
          <IconDelete aria-hidden />
        </Button>
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
    <span className={"delta col-start-1 text-[12px] font-semibold [&.good]:[color:#30d158] [&.warn]:[color:#ffd60a] [&.bad]:text-over [&.flat]:text-muted-foreground " + (change < 0 ? "good" : change > 0 ? "bad" : "flat")}>
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
    <span className={"delta col-start-1 text-[12px] font-semibold [&.good]:[color:#30d158] [&.warn]:[color:#ffd60a] [&.bad]:text-over [&.flat]:text-muted-foreground " + (state === "over" ? "bad" : state === "closing" ? "warn" : "good")}>
      {text}
      {deficit > 0 && <span className="delta-note text-subtle font-normal"> after {num(deficit)} deficit</span>}
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
        <div className={cn(
          "errorcard border border-solid border-[rgb(245_184_92_/_0.3)] bg-warning-muted rounded-[var(--r-tile)] p-5.5",
          "grid gap-3.5 text-[13px] [&_h2]:text-[16px] [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
          "[&_pre]:[font:11.5px/1.6_var(--mono)] [&_pre]:text-muted-foreground [&_.secondary]:justify-self-start"
        )} role="alert">
          <p>Some records could not be read.</p>
          <pre>{view.broken.join("\n")}</pre>
        </div>
      )}
      <div className={cn(
        "day grid gap-3 [transition:opacity_200ms_ease] [&[aria-busy=true]]:opacity-[0.6]",
        "max-[1181px]:grid-cols-[minmax(0,_1.35fr)_minmax(0,_1fr)] max-[1181px]:items-start",
        "max-[761px]:grid-cols-[minmax(0,_1fr)]"
      )} aria-busy={loading} inert={loading}>
        <Nutrition view={view} targets={targets} pending={pending} onSync={onSync} />
        <div className={cn(
          "tile-pair grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-3 max-[1181px]:grid-cols-[minmax(0,_1fr)]",
          "max-[1181px]:h-full max-[761px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[381px]:grid-cols-[minmax(0,_1fr)]"
        )}>
          <section className={cn(
            "tile min-w-0 bg-card border border-solid border-border rounded-[var(--r-tile)]",
            "shadow-[inset_0_1px_0_rgb(255_255_255_/_0.035)] tile-weight [&_h2_svg]:text-weight"
          )} aria-label="Weight for selected day">
            <header className={cn(
              "tile-head flex items-center justify-between gap-3 [padding:15px_18px_0] min-h-[42px] [&_h2]:flex",
              "[&_h2]:items-center [&_h2]:gap-[7px] [&_h2]:text-[13px] [&_h2]:tracking-[-0.005em] [&_>_span]:text-subtle",
              "[&_>_span]:text-[11.5px] [&_h2]:whitespace-nowrap [&_>_span]:whitespace-nowrap",
              "[&_.text-action]:whitespace-nowrap"
            )}>
              <h2>
                <IconWeight size={15} aria-hidden />
                Weight
              </h2>
              <button className="text-action border-0 bg-none bg-transparent py-0.5 px-0 text-muted-foreground text-[12px] font-[590] pointer-hover:[&:hover]:text-foreground" onClick={onAddWeight}>
                Log weight
              </button>
            </header>
            {view.weights.length === 0 ? (
              <p className="tile-empty [padding:12px_18px_18px] text-subtle text-[13px]">No weigh-in</p>
            ) : (
              view.weights.map((point, index) => (
                <div className={cn(
                  "reading grid grid-cols-[minmax(0,_1fr)_auto] items-start gap-y-0.5 gap-x-2 [padding:8px_18px_16px]",
                  "[&_+_.reading]:border-t [&_+_.reading]:[border-top-style:solid] [&_+_.reading]:border-t-border [&_+_.reading]:pt-3",
                  "[&_strong]:col-start-1 [&_strong]:[font:650_28px/1.1_var(--rounded)] [&_strong]:tracking-[-0.02em]",
                  "[&_strong_small]:[font:500_13px_var(--sans)] [&_strong_small]:text-muted-foreground",
                  "[&_strong_small]:tracking-[0] [&_p]:col-span-full [&_p]:text-muted-foreground [&_p]:text-[12px]",
                  "[&_.record-actions]:col-start-2 [&_.record-actions]:row-start-1 [&_.record-actions]:self-center",
                  "max-[761px]:[&_strong]:whitespace-nowrap max-[761px]:[&_.record-actions]:col-start-1",
                  "max-[761px]:[&_.record-actions]:row-auto max-[761px]:[&_.record-actions]:[margin-left:-8px]"
                )} key={point.path}>
                  <strong>
                    {num(point.value, 1)}
                    <small> {point.unit}</small>
                  </strong>
                  {index === 0 && <WeightChange view={view} value={point.value} />}
                  <span className="reading-meta col-start-1 flex items-center gap-2 text-subtle text-[11.5px]">
                    {clock(point.time)}
                    {point.state !== "synced" && (
                      <span className="record-state inline-flex items-center rounded-full py-0 px-[7px] bg-warning-muted text-warning text-[10.5px] font-[590] leading-[18px]">{point.state}</span>
                    )}
                  </span>
                  {point.remote_note && <p>{point.remote_note}</p>}
                  <div className="record-actions flex gap-0.5">
                    <Button
                      variant="icon"
                      aria-label={"Edit weight at " + clock(point.time)}
                      title="Edit"
                      onClick={() =>
                        setAction({ mode: "edit", kind: "weight", record: point, title: "Weight" })
                      }
                    >
                      <IconEdit aria-hidden />
                    </Button>
                    <Button
                      variant="icon" className="danger"
                      aria-label={"Delete weight at " + clock(point.time)}
                      title="Delete"
                      onClick={() =>
                        setAction({ mode: "delete", kind: "weight", record: point, title: "Weight" })
                      }
                    >
                      <IconDelete aria-hidden />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>
          <section className={cn(
            "tile min-w-0 bg-card border border-solid border-border rounded-[var(--r-tile)]",
            "shadow-[inset_0_1px_0_rgb(255_255_255_/_0.035)] tile-burned [&_h2_svg]:text-energy",
            "max-[761px]:[&_.tile-head_>_span]:hidden"
          )} aria-label="Calories burned for selected day">
            <header className={cn(
              "tile-head flex items-center justify-between gap-3 [padding:15px_18px_0] min-h-[42px] [&_h2]:flex",
              "[&_h2]:items-center [&_h2]:gap-[7px] [&_h2]:text-[13px] [&_h2]:tracking-[-0.005em] [&_>_span]:text-subtle",
              "[&_>_span]:text-[11.5px] [&_h2]:whitespace-nowrap [&_>_span]:whitespace-nowrap",
              "[&_.text-action]:whitespace-nowrap"
            )}>
              <h2>
                <IconBurned size={15} aria-hidden />
                Burned
              </h2>
              <span>Google Health</span>
            </header>
            {view.burned ? (
              <div className={cn(
                "reading grid grid-cols-[minmax(0,_1fr)_auto] items-start gap-y-0.5 gap-x-2 [padding:8px_18px_16px]",
                "[&_+_.reading]:border-t [&_+_.reading]:[border-top-style:solid] [&_+_.reading]:border-t-border [&_+_.reading]:pt-3",
                "[&_strong]:col-start-1 [&_strong]:[font:650_28px/1.1_var(--rounded)] [&_strong]:tracking-[-0.02em]",
                "[&_strong_small]:[font:500_13px_var(--sans)] [&_strong_small]:text-muted-foreground",
                "[&_strong_small]:tracking-[0] [&_p]:col-span-full [&_p]:text-muted-foreground [&_p]:text-[12px]",
                "[&_.record-actions]:col-start-2 [&_.record-actions]:row-start-1 [&_.record-actions]:self-center",
                "max-[761px]:[&_strong]:whitespace-nowrap max-[761px]:[&_.record-actions]:col-start-1",
                "max-[761px]:[&_.record-actions]:row-auto max-[761px]:[&_.record-actions]:[margin-left:-8px]"
              )}>
                <strong>
                  {num(view.burned.kcal)}
                  <small> kcal</small>
                </strong>
                <BudgetLeft view={view} deficit={targets.daily_deficit_kcal ?? 0} />
                <span className="reading-meta col-start-1 flex items-center gap-2 text-subtle text-[11.5px]">
                  {view.day === view.today ? "So far, updated " : "Updated "}
                  {view.burned.fetched.slice(0, 10) === view.day
                    ? clock(view.burned.fetched)
                    : view.burned.fetched.slice(5, 10) + " " + clock(view.burned.fetched)}
                </span>
              </div>
            ) : (
              <p className="tile-empty [padding:12px_18px_18px] text-subtle text-[13px]">Not pulled yet</p>
            )}
          </section>
        </div>
        <section className={cn(
          "tile min-w-0 bg-card border border-solid border-border rounded-[var(--r-tile)]",
          "shadow-[inset_0_1px_0_rgb(255_255_255_/_0.035)] meal-log pb-2 max-[1181px]:col-span-full"
        )} aria-label="Meals for selected day">
          <header className={cn(
            "tile-head flex items-center justify-between gap-3 [padding:15px_18px_0] min-h-[42px] [&_h2]:flex",
            "[&_h2]:items-center [&_h2]:gap-[7px] [&_h2]:text-[13px] [&_h2]:tracking-[-0.005em] [&_>_span]:text-subtle",
            "[&_>_span]:text-[11.5px] [&_h2]:whitespace-nowrap [&_>_span]:whitespace-nowrap",
            "[&_.text-action]:whitespace-nowrap"
          )}>
            <h2>Food log</h2>
            <span>Per portion</span>
          </header>
          {view.food.length === 0 ? (
            <div className={cn(
              "empty-day grid justify-items-center gap-2 [padding:44px_24px_40px] text-center [&_svg]:text-subtle [&_svg]:mb-1",
              "[&_h3]:text-[15px] [&_p]:text-muted-foreground [&_p]:text-[12.5px] [&_p]:mb-2"
            )}>
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
                <section className="meal-group" key={meal} aria-label={MEAL_NAME[meal] ?? meal}>
                  <div className={cn(
                    "meal-heading flex justify-between items-baseline [padding:16px_18px_4px] [&_h3]:text-[12px]",
                    "[&_h3]:text-muted-foreground [&_>_span]:text-subtle [&_>_span]:text-[11.5px]"
                  )}>
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
          <p className="record-date text-muted-foreground bg-popover py-[11px] px-5.5 border-b [border-bottom-style:solid] border-b-border text-[12px] max-[761px]:py-[11px] max-[761px]:px-4.5">
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
