import { useEffect, useMemo, useState } from "react";
import { IconWeight, IconFood, IconPulse, IconBurned } from "../lib/icons";
import * as api from "../lib/api";
import { centredMean, meanOfLogged, ratePerWeek } from "../lib/series";
import { makeDayScale } from "../lib/scale";
import { RANGES } from "../lib/navigation";
import { budget } from "../lib/budget";
import { num, parseDay } from "../lib/format";
import type { Series } from "../lib/types";
import { WeightChart } from "./charts/WeightChart";
import { IntakeChart, NutrientChart } from "./charts/IntakeChart";

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
    <div className={`stat ${tone}`}>
      <div className="stat-label">
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
      <div className="stat-value">
        {value === "No data" ? (
          <span className="stat-none">No data</span>
        ) : (
          <>
            {value.split(" ")[0]}
            <small> {value.split(" ").slice(1).join(" ")}</small>
          </>
        )}
      </div>
      <div className="stat-hint">{hint ?? "\u00A0"}</div>
    </div>
  );
}

/**
 * Calories left today: burned so far, minus eaten, minus the deficit goal.
 * Burned keeps rising through the day, so the budget does too.
 */
function todayBudget(series: Series): { value: string; tone: string; hint: string } {
  const row = series.rows.find((r) => r.day === series.today);
  const deficit = series.targets.daily_deficit_kcal ?? 0;
  if (!row || row.burned === null)
    return { value: "No data", tone: "budget", hint: "Burned not pulled yet" };
  const eaten = row.kcal ?? 0;
  const { left, state } = budget(row.burned, eaten, deficit);
  const parts = [`${num(row.burned)} burned`, `${num(eaten)} eaten`];
  if (deficit > 0) parts.push(`${num(deficit)} deficit`);
  return {
    value: left >= 0 ? `${num(left)} kcal left` : `${num(-left)} kcal over`,
    tone: "budget " + state,
    hint: parts.join(", "),
  };
}

export function Trends({
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
    <div className="seg" role="group" aria-label="Trend range">
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
      <section className="trends" aria-label="Trends">
        <div className="errorcard" role="alert">
          <h2>Couldn’t load trends.</h2>
          <pre>{problem}</pre>
          <button
            className="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry trends
          </button>
        </div>
      </section>
    );
  if (!series || !scale || !stats || series.days !== days)
    return (
      <section className="trends" aria-label="Trends">
        <div className="trends-bar">
          <h2>Trends</h2>
          {rangeControl}
        </div>
        <div className="skeleton-stats" role="status" aria-label="Loading trends">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} />
          ))}
        </div>
        <div className="chart-skeleton" />
      </section>
    );
  const inRange =
    selectedDay >= series.since && selectedDay <= series.until
      ? selectedDay
      : null;

  const budget = todayBudget(series);
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
    <section className="trends" aria-label="Trends" aria-busy={loading}>
      <div className="trends-bar">
        <h2>Trends</h2>
        <span className="range-dates">
          {parseDay(series.since).toLocaleDateString([], {
            day: "numeric",
            month: "short",
          })}
          {" - "}
          {parseDay(series.until).toLocaleDateString([], {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        {rangeControl}
      </div>

      {/* Range summaries stay independent of the selected day's readings.
          The budget is always today's, whatever day is selected. */}
      <div className="stats">
        <Stat
          value={budget.value}
          label="Budget today"
          tone={budget.tone}
          hint={budget.hint}
        />
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
      <section className="tile chart-panel" aria-label="Weight and nutrition charts">
        <div className="chart-panel-heading">
          <h3>Weight & nutrition</h3>
          <span className="chart-key">
            <i />
            7-day average
          </span>
        </div>
        <div className="dayread" aria-live="polite">
          <div className="dayread-head">
            {shown
              ? parseDay(shown.day).toLocaleDateString([], {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              : "Selected day is outside this range"}
            {hoverDay && hoverDay !== inRange && (
              <span className="dayread-hint">Click to select</span>
            )}
          </div>
          {shown && (
            <div className="dayread-row">
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
        <div className="stack" ref={setChartNode}>
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
        <p className="viz-caption">
          Click a chart to open that day. Logged intake and measured weight are
          two records side by side, not cause and effect: weight moves with
          hydration, sleep and time of day.
        </p>
      </section>
    </section>
  );
}
