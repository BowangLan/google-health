import { Surface } from "@/design-system/primitives/surface";
import { cn } from "@/design-system/lib/cn";
import { segmentedClassName } from "@/design-system/patterns/form-styles";
import { Button } from "@/design-system/primitives/button";
import { useEffect, useMemo, useState } from "react";
import {
  IconWeight,
  IconFood,
  IconPulse,
  IconBurned,
} from "@/design-system/foundations/icons";
import * as api from "@/lib/api";
import { centredMean, meanOfLogged, ratePerWeek } from "@/features/trends/lib/series";
import { makeDayScale } from "@/features/trends/lib/scale";
import { RANGES } from "@/lib/navigation";
import { num, parseDay } from "@/lib/format";
import type { Series } from "@/lib/types";
import { WeightChart } from "@/features/trends/components/charts/weight-chart";
import { IntakeChart } from "@/features/trends/components/charts/intake-chart";
import { NutrientChart } from "@/features/trends/components/charts/nutrient-chart";

const INITIAL_WIDTH = 720;
const GUTTER = { left: 52, right: 44 };

function signed(value: number, digits = 2): string {
  // A true minus sign, so signs align in a tabular column.
  return `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${Math.abs(value).toFixed(digits)}`;
}

/** Stable summary slots keep the chart position independent of the values. */
function Stat({
  value,
  label,
  hint,
  tone = "weight",
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={cn(
      "stat min-w-0 p-4 bg-card border border-solid border-border rounded-[18px] max-[381px]:p-3",
      "[&.budget]:col-span-full [&.budget.ok_.stat-value]:[color:var(--ds-color-positive)] [&.budget.closing_.stat-value]:[color:var(--ds-color-caution)]",
      "[&.calories_.stat-label_svg]:text-energy [&.budget_.stat-label_svg]:text-energy [&.budget.over_.stat-value]:text-over [&.protein_.stat-label_svg]:text-protein",
      "min-[762px]:[&.budget]:grid min-[762px]:[&.budget]:grid-cols-[auto_auto_minmax(0,_1fr)] min-[762px]:[&.budget]:items-center min-[762px]:[&.budget]:gap-x-4",
      "min-[762px]:[&.budget]:py-3 min-[762px]:[&.budget_.stat-value]:mt-0 min-[762px]:[&.budget_.stat-hint]:mt-0 min-[762px]:[&.budget_.stat-hint]:text-right",
      tone
    )}>
      <div className="stat-label flex items-center gap-1.5 text-ui-label font-semibold [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:text-weight max-[381px]:text-ui-caption max-[381px]:whitespace-nowrap">
        {tone.startsWith("budget") ? (
          <IconBurned aria-hidden />
        ) : tone === "calories" ? (
          <IconFood aria-hidden />
        ) : tone === "protein" ? (
          <IconPulse aria-hidden />
        ) : (
          <IconWeight aria-hidden />
        )}
        <span>{label}</span>
      </div>
      <div className={cn(
        "stat-value mt-2 [font:650_23px/1.15_var(--ds-font-numeric)] tracking-[-0.02em] whitespace-nowrap",
        "[&_small]:[font:500_12px_var(--ds-font-body)] [&_small]:text-muted-foreground [&_small]:tracking-[0]",
        "min-[1181px]:max-[1441px]:text-[20px]"
      )}>
        {value === "No data" ? (
          <span className="stat-none [font:500_15px_var(--ds-font-body)] text-subtle">No data</span>
        ) : (
          <>
            {value.split(" ")[0]}
            <small> {value.split(" ").slice(1).join(" ")}</small>
          </>
        )}
      </div>
      <div className="stat-hint mt-1 text-subtle text-ui-detail leading-4 text-pretty">{hint ?? "\u00A0"}</div>
    </div>
  );
}

export function TrendsSection({
  unit,
  days,
  selectedDay,
  revision,
  onSelect,
  onRange,
}: {
  revision: number;
  unit: "kg" | "lb";
  days: number;
  /** The dashboard's selected day; clicking a chart changes it. */
  selectedDay: string;
  onSelect: (day: string) => void;
  onRange: (days: number) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chartNode, setChartNode] = useState<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(INITIAL_WIDTH);
  useEffect(() => {
    if (!chartNode) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setChartWidth(entry.contentRect.width);
    });
    observer.observe(chartNode);
    return () => observer.disconnect();
  }, [chartNode]);
  const [series, setSeries] = useState<Series | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setProblem(null);
    api
      .getSeries(days, unit)
      .then((data) => {
        if (live) {
          setSeries(data);
          setProblem(null);
        }
      })
      .catch((cause) => {
        if (live)
          setProblem(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [days, unit, revision, attempt]);

  const scale = useMemo(
    () =>
      series
        ? makeDayScale(
          series.since,
          series.until,
          chartWidth,
          GUTTER.left,
          GUTTER.right,
        )
        : null,
    [series, chartWidth],
  );

  const stats = useMemo(() => {
    if (!series) return null;
    const trend = centredMean(series.rows);
    const rate = ratePerWeek(trend);
    const latest = trend[trend.length - 1];
    const kcal = meanOfLogged(series.rows, "kcal");
    const protein = meanOfLogged(series.rows, "protein");
    return { trend, rate, latest, kcal, protein };
  }, [series]);

  const rangeControl = (
    <div className={segmentedClassName} role="group" aria-label="Trend range">
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={range === days}
          onClick={() => {
            setHoverDay(null);
            onRange(range);
          }}
        >
          {range === 365 ? "1y" : `${range}d`}
        </button>
      ))}
    </div>
  );

  if (problem)
    return (
      <section className="trends grid gap-3 min-w-0 [&[aria-busy=true]_.chart-panel]:opacity-[0.7]" aria-label="Trends">
        <div className={cn(
          "errorcard border border-solid border-[var(--ds-color-warning-border)] bg-warning-muted rounded-tile p-5.5",
          "grid gap-3.5 text-ui-body [&_h2]:text-[16px] [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
          "[&_pre]:[font:11.5px/1.6_var(--ds-font-code)] [&_pre]:text-muted-foreground [&_.secondary]:justify-self-start"
        )} role="alert">
          <h2>Couldn’t load trends.</h2>
          <pre>{problem}</pre>
          <Button
            variant="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry trends
          </Button>
        </div>
      </section>
    );
  if (!series || !scale || !stats || series.days !== days)
    return (
      <section className="trends grid gap-3 min-w-0 [&[aria-busy=true]_.chart-panel]:opacity-[0.7]" aria-label="Trends">
        <div className="trends-bar flex items-center gap-3 min-h-[36px] [&_h2]:text-ui-subheading [&_h2]:tracking-[-0.01em] max-[761px]:flex-wrap">
          <h2>Trends</h2>
          {rangeControl}
        </div>
        <div
          className={cn(
            "skeleton-stats grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-3 [&_i]:block [&_i]:bg-card [&_i]:border ",
            "[&_i]:border-solid [&_i]:border-border [&_i]:animate-[breathe_1.6s_ease-in-out_infinite] [&_i]:h-24",
            "[&_i]:rounded-[18px] max-[761px]:grid-cols-[repeat(2,_minmax(0,_1fr))]",
            ""
          )}
          role="status"
          aria-label="Loading trends"
        >
          {[0, 1, 2, 3].map((i) => (
            <i key={i} />
          ))}
        </div>
        <div className="chart-skeleton block bg-card border border-solid border-border animate-[breathe_1.6s_ease-in-out_infinite] h-155 rounded-tile" />
      </section>
    );
  const inRange =
    selectedDay >= series.since && selectedDay <= series.until
      ? selectedDay
      : null;

  const rate = stats.rate === null ? null : Number(stats.rate.toFixed(2));
  const direction =
    rate === null || rate === 0 ? "steady" : rate > 0 ? "up" : "down";
  const shownDay = hoverDay ?? inRange;
  const shown = shownDay
    ? series.rows.find((row) => row.day === shownDay)
    : undefined;
  const shownTrend = shownDay
    ? stats.trend.find((point) => point.day === shownDay)
    : undefined;

  return (
    <section className="trends grid gap-3 min-w-0 [&[aria-busy=true]_.chart-panel]:opacity-[0.7]" aria-label="Trends" aria-busy={loading}>
      <div className="trends-bar flex items-center gap-3 min-h-[36px] [&_h2]:text-ui-subheading [&_h2]:tracking-[-0.01em] max-[761px]:flex-wrap">
        <span className="range-dates text-subtle text-ui-label max-[761px]:w-full">
          {parseDay(series.since).toLocaleDateString([], {
            day: "numeric",
            month: "short",
          })}
          {" – "}
          {parseDay(series.until).toLocaleDateString([], {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        {rangeControl}
      </div>

      {/* Range summaries describe this whole interval; the journal owns day-specific values. */}
      <div className="stats grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-3 max-[761px]:grid-cols-[repeat(2,_minmax(0,_1fr))]">
        <Stat
          value={
            stats.latest
              ? `${num(stats.latest.value, 1)} ${series.unit}`
              : "No data"
          }
          label="Weight trend"
          hint={stats.latest?.provisional ? "Provisional" : "Seven-day average"}
        />
        <Stat
          value={
            rate === null ? "No data" : `${signed(rate)} ${series.unit}/wk`
          }
          tone={direction}
          label="Weekly change"
          hint={
            rate === null
              ? "Needs more readings"
              : direction === "steady"
                ? "Steady, fitted rate"
                : `Trending ${direction}, fitted rate`
          }
        />
        <Stat
          value={
            stats.kcal.value === null
              ? "No data"
              : `${num(stats.kcal.value)} kcal`
          }
          label="Daily intake"
          tone="calories"
          hint={`${stats.kcal.days} of ${stats.kcal.of} days logged`}
        />
        <Stat
          value={
            stats.protein.value === null
              ? "No data"
              : `${num(stats.protein.value)} g`
          }
          label="Daily protein"
          tone="protein"
          hint={`Over ${stats.protein.days} days`}
        />
      </div>
      <Surface
        className={cn(
          "tile",
          "chart-panel pb-1 [transition:opacity_var(--ds-duration-normal)_ease]"
        )}
        aria-label="Weight and nutrition charts"
      >
        <div className="chart-panel-heading flex justify-between items-center gap-3 [padding:16px_18px_0] [&_h3]:text-ui-body">
          <h3>Weight & nutrition</h3>
          <span className="chart-key inline-flex items-center gap-[7px] text-subtle text-ui-detail [&_i]:w-4 [&_i]:h-0.5 [&_i]:rounded-[2px] [&_i]:bg-weight">
            <i />
            7-day average
          </span>
        </div>
        <div className="dayread flex items-center flex-wrap gap-y-1.5 gap-x-4 min-h-[40px] [margin:12px_18px_4px] py-2.5 px-3 rounded-lg border border-solid border-border bg-popover text-ui-label" aria-live="polite">
          <div className="dayread-head flex gap-2.5 font-semibold">
            {shown
              ? parseDay(shown.day).toLocaleDateString([], {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
              : "Selected day is outside this range"}
            {hoverDay && hoverDay !== inRange && (
              <span className="dayread-hint text-subtle font-normal">Click to select</span>
            )}
          </div>
          {shown && (
            <div className="dayread-row flex flex-wrap gap-y-1 gap-x-4 ml-auto text-muted-foreground [&_.weight]:text-foreground max-[761px]:ml-0">
              <span className="weight">
                {shown.weight == null
                  ? "No reading"
                  : `${num(shown.weight, 1)} ${series.unit}`}
              </span>
              <span>
                {shownTrend ? `${num(shownTrend.value, 2)} avg` : "No average"}
              </span>
              <span>
                {shown.kcal == null ? "Not logged" : `${num(shown.kcal)} kcal`}
              </span>
            </div>
          )}
        </div>
        {/* One axis, one crosshair. Reading co-movement off aligned panels is the
        honest form of "how does food relate to weight"; a dual axis would let
        the scales manufacture any correlation you like. */}
        <div className="stack [padding:2px_0_0]" ref={setChartNode}>
          <WeightChart
            series={series}
            scale={scale}
            hoverDay={hoverDay}
            onHover={setHoverDay}
            pinnedDay={inRange}
            onPick={onSelect}
            showAxis={false}
          />
          <IntakeChart
            series={series}
            scale={scale}
            hoverDay={hoverDay}
            onHover={setHoverDay}
            pinnedDay={inRange}
            onPick={onSelect}
            showAxis={false}
          />
          <NutrientChart
            series={series}
            scale={scale}
            hoverDay={hoverDay}
            onHover={setHoverDay}
            pinnedDay={inRange}
            onPick={onSelect}
            showAxis
            label="Protein"
            field="protein"
            target={series.targets.daily_protein_g}
            unit="grams"
          />
        </div>
        <p className="viz-caption border-t [border-top-style:solid] border-t-border mt-3 [padding:14px_18px_14px] text-subtle text-ui-detail leading-[1.65]">
          <span className="block max-w-[80ch]">
          Click a chart to open that day. Logged intake and measured weight are
          two records side by side, not cause and effect: weight moves with
          hydration, sleep and time of day.
          </span>
        </p>
      </Surface>
    </section>
  );
}
