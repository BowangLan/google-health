import { useEffect, useMemo, useState } from "react";
import { IconWeight, IconTrends, IconFood, IconPulse } from "../lib/icons";
import * as api from "../lib/api";
import { centredMean, meanOfLogged, ratePerWeek } from "../lib/series";
import { makeDayScale } from "../lib/scale";
import { journalHref, trendsHref } from "../lib/navigation";
import { num, parseDay } from "../lib/format";
import type { Series } from "../lib/types";
import { WeightChart } from "./charts/WeightChart";
import { IntakeChart, NutrientChart } from "./charts/IntakeChart";

const RANGES = [30, 90, 180, 365] as const;
const INITIAL_WIDTH = 720;
const GUTTER = { left: 52, right: 44 };

function signed(value: number, digits = 2): string {
  // A true minus sign, so signs align in a tabular column.
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
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
        <span>{label}</span>
        {tone === "weight" ? (
          <IconWeight aria-hidden />
        ) : tone === "calories" ? (
          <IconFood aria-hidden />
        ) : tone === "protein" ? (
          <IconPulse aria-hidden />
        ) : (
          <IconTrends aria-hidden />
        )}
      </div>
      <div className="stat-value">
        {value === "No data" ? (
          value
        ) : (
          <>
            {value.split(" ")[0]}{" "}
            <small>{value.split(" ").slice(1).join(" ")}</small>
          </>
        )}
      </div>
      <div className="stat-hint">{hint ?? "\u00A0"}</div>
    </div>
  );
}

export function Trends({
  unit,
  days,
  inspectedDay,
  revision,
  navigate,
}: {
  revision: number;
  unit: "kg" | "lb";
  days: number;
  inspectedDay: string | null;
  navigate: (href: string, replace?: boolean) => void;
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

  if (problem)
    return (
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
    );
  if (!series || !scale || !stats || series.days !== days)
    return (
      <div className="trends" role="status" aria-label="Loading trends">
        <div className="skeleton-stats">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} />
          ))}
        </div>
        <div className="chart-skeleton" />
      </div>
    );
  const selected =
    inspectedDay && inspectedDay >= series.since && inspectedDay <= series.until
      ? inspectedDay
      : series.until;
  const onSelect = (day: string) => navigate(trendsHref(days, day), true);

  const rate = stats.rate === null ? null : Number(stats.rate.toFixed(2));
  const direction =
    rate === null || rate === 0 ? "steady" : rate > 0 ? "up" : "down";
  const shownDay = hoverDay ?? selected;
  const hovered = shownDay
    ? series.rows.find((row) => row.day === shownDay)
    : undefined;
  const hoveredTrend = shownDay
    ? stats.trend.find((point) => point.day === shownDay)
    : undefined;

  return (
    <div className="trends" aria-busy={loading}>
      <div className="trends-bar">
        <div className="range-heading">
          <h2>Time range</h2>
          <span className="viz-sub">Ending today</span>
        </div>
        <div className="seg" aria-label="Trend range">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={range === days}
              onClick={() => {
                setHoverDay(null);
                navigate(trendsHref(range));
              }}
            >
              {range === 365 ? "1y" : `${range}d`}
            </button>
          ))}
        </div>
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
      </div>

      {/* Range summaries stay independent of the selected day's readings. */}
      <div className="stats">
        <Stat
          value={
            stats.latest
              ? `${num(stats.latest.value, 1)} ${series.unit}`
              : "No data"
          }
          label="Weight trend"
          hint={stats.latest?.provisional ? "provisional" : "seven-day average"}
        />
        <Stat
          value={
            rate === null ? "No data" : `${signed(rate)} ${series.unit}/wk`
          }
          tone={direction}
          label="Weekly change"
          hint={
            rate === null
              ? "needs more readings"
              : `${direction === "steady" ? "steady" : `trending ${direction}`} · fitted rate`
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
          hint={`over ${stats.kcal.days} of ${stats.kcal.of} days logged`}
        />
        <Stat
          value={
            stats.protein.value === null
              ? "No data"
              : `${num(stats.protein.value)} g`
          }
          label="Daily protein"
          tone="protein"
          hint={`over ${stats.protein.days} days`}
        />
      </div>
      <div className="trends-analysis">
        <section className="chart-panel" aria-label="Health trends">
          <div className="chart-panel-heading">
            <div>
              <h2>Weight & nutrition</h2>
              <p>{days} days of weight and nutrition</p>
            </div>
            <span className="chart-key">
              <i />
              7-day average
            </span>
          </div>
          <div className="dayread">
            <div className="dayread-head">
              {hovered
                ? parseDay(hovered.day).toLocaleDateString([], {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })
                : "No data"}
              {hoverDay && hoverDay !== selected && (
                <span className="stat-hint"> click to select</span>
              )}
            </div>
            <div className="dayread-row">
              <span>
                {hovered?.weight == null
                  ? "no reading"
                  : `${num(hovered.weight, 1)} ${series.unit}`}
              </span>
              <span>
                {hoveredTrend
                  ? `${num(hoveredTrend.value, 2)} avg`
                  : "no average"}
              </span>
              <span>
                {hovered?.kcal == null
                  ? "not logged"
                  : `${num(hovered.kcal)} kcal`}
              </span>
            </div>
            <div className="stat-hint">
              {hovered?.first_entry
                ? `${hovered.entries} entries · ${hovered.first_entry} - ${hovered.last_entry}`
                : hovered?.weight_readings && hovered.weight_readings.length > 1
                  ? `${hovered.weight_readings.length} readings, first shown`
                  : "\u00A0"}
            </div>
          </div>
          <div className="inspection-controls">
            <label>
              Inspect a day
              <input
                type="date"
                aria-label="Inspect a day in Trends"
                min={series.since}
                max={series.until}
                value={selected}
                onChange={(event) => {
                  if (
                    event.target.value >= series.since &&
                    event.target.value <= series.until
                  ) {
                    setHoverDay(null);
                    onSelect(event.target.value);
                  }
                }}
              />
            </label>
            <a className="secondary" href={journalHref(selected)}>
              Open{" "}
              {parseDay(selected).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}{" "}
              in Journal
            </a>
          </div>
          <p className="chart-instruction">
            Click a chart to inspect a day. Open its journal to see or edit the
            entries.
          </p>
          {/* One axis, one crosshair. Reading co-movement off aligned panels is the
          honest form of "how does food relate to weight"; a dual axis would let
          the scales manufacture any correlation you like. */}
          <div className="stack" ref={setChartNode}>
            <WeightChart
              series={series}
              scale={scale}
              hoverDay={hoverDay}
              onHover={setHoverDay}
              pinnedDay={selected}
              onPick={onSelect}
              showAxis={false}
            />
            <IntakeChart
              series={series}
              scale={scale}
              hoverDay={hoverDay}
              onHover={setHoverDay}
              pinnedDay={selected}
              onPick={onSelect}
              showAxis={false}
            />
            <NutrientChart
              series={series}
              scale={scale}
              hoverDay={hoverDay}
              onHover={setHoverDay}
              pinnedDay={selected}
              onPick={onSelect}
              showAxis
              label="Protein"
              field="protein"
              target={series.targets.daily_protein_g}
              unit="grams"
            />
          </div>

          <p className="viz-caption">
            Logged intake and measured weight over the same dates. Some days
            have no food record, and weight moves with hydration, sleep and time
            of day. Read these as two records side by side, not as cause and
            effect.
          </p>
        </section>
      </div>
    </div>
  );
}
