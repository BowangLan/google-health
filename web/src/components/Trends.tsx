import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { centredMean, meanOfLogged, ratePerWeek } from "../lib/series";
import { makeDayScale } from "../lib/scale";
import { num, parseDay } from "../lib/format";
import type { Series } from "../lib/types";
import { WeightChart } from "./charts/WeightChart";
import { IntakeChart, NutrientChart } from "./charts/IntakeChart";

const RANGES = [30, 90, 180, 365] as const;
const WIDTH = 1000;
const GUTTER = { left: 52, right: 44 };

function signed(value: number, digits = 2): string {
  // A true minus sign, so signs align in a tabular column.
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
}

/**
 * Always three lines, even when the hint is empty. This block swaps its
 * contents on hover, and a conditionally rendered line would change the row's
 * height and shove every chart below it as the pointer moves.
 */
function Stat({ value, label, hint, tone = "weight" }: { value: string; label: string; hint?: string; tone?: string }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-hint">{hint ?? "\u00A0"}</div>
    </div>
  );
}

export function Trends({ unit, selected, onSelect }: {
  unit: "kg" | "lb";
  selected: string;
  onSelect: (day: string) => void;
}) {
  const [days, setDays] = useState<number>(90);
  const [series, setSeries] = useState<Series | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.getSeries(days, unit)
      .then((data) => { if (live) { setSeries(data); setProblem(null); } })
      .catch((cause) => { if (live) setProblem(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, [days, unit]);


  const scale = useMemo(
    () => series ? makeDayScale(series.since, series.until, WIDTH, GUTTER.left, GUTTER.right) : null,
    [series],
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

  if (problem) {
    return <div className="errorcard"><div>Could not load the series.</div><pre>{problem}</pre></div>;
  }
  if (!series || !scale || !stats) return <div className="note">Loading…</div>;

  const rate = stats.rate === null ? null : Number(stats.rate.toFixed(2));
  const direction = rate === null || rate === 0 ? "steady" : rate > 0 ? "up" : "down";
  const shownDay = hoverDay ?? selected;
  const hovered = shownDay ? series.rows.find((row) => row.day === shownDay) : undefined;
  const hoveredTrend = shownDay ? stats.trend.find((point) => point.day === shownDay) : undefined;


  return (
    <div className="trends">
      <div className="trends-bar">
        <div className="seg">
          {RANGES.map((range) => (
            <button key={range} type="button" aria-pressed={range === days}
              onClick={() => setDays(range)}>
              {range === 365 ? "1y" : `${range}d`}
            </button>
          ))}
        </div>
        <span className="viz-sub">
          {parseDay(series.since).toLocaleDateString([], { day: "numeric", month: "short" })}
          {" – "}
          {parseDay(series.until).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>

      {/* Two readings, side by side and both always present: the range as a
          whole on the left, and whichever day the pointer or the selection
          names on the right. Fixed slots, so nothing reflows on hover. */}
      <div className="stats">
        <Stat
          value={stats.latest ? `${num(stats.latest.value, 1)} ${series.unit}` : "—"}
          label="weight trend"
          hint={stats.latest?.provisional ? "provisional" : "seven-day average"}
        />
        <Stat
          value={rate === null ? "—" : `${direction === "up" ? "↗ " : direction === "down" ? "↘ " : ""}${signed(rate)} ${series.unit}/wk`}
          tone={direction}
          label={`over ${days} days`}
          hint={rate === null ? "needs more readings" : `${direction === "steady" ? "steady" : `trending ${direction}`} · fitted rate`}
        />
        <Stat
          value={stats.kcal.value === null ? "—" : `${num(stats.kcal.value)} kcal`}
          label="average intake"
          tone="calories"
          hint={`over ${stats.kcal.days} of ${stats.kcal.of} days logged`}
        />
        <Stat
          value={stats.protein.value === null ? "—" : `${num(stats.protein.value)} g`}
          label="average protein"
          tone="protein"
          hint={`over ${stats.protein.days} days`}
        />

        <div className="dayread">
          <div className="dayread-head">
            {hovered
              ? parseDay(hovered.day).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
              : "—"}
            {hoverDay && hoverDay !== selected && <span className="stat-hint"> click to select</span>}
          </div>
          <div className="dayread-row">
            <span>{hovered?.weight == null ? "no reading" : `${num(hovered.weight, 1)} ${series.unit}`}</span>
            <span>
              {hoveredTrend ? `${num(hoveredTrend.value, 2)} avg` : "—"}
            </span>
            <span>
              {hovered?.kcal == null ? "not logged" : `${num(hovered.kcal)} kcal`}
            </span>
          </div>
          <div className="stat-hint">
            {hovered?.first_entry
              ? `${hovered.entries} entries · ${hovered.first_entry} – ${hovered.last_entry}`
              : hovered?.weight_readings && hovered.weight_readings.length > 1
                ? `${hovered.weight_readings.length} readings, first shown`
                : "\u00A0"}
          </div>
        </div>
      </div>

      {/* One axis, one crosshair. Reading co-movement off aligned panels is the
          honest form of "how does food relate to weight"; a dual axis would let
          the scales manufacture any correlation you like. */}
      <div className="stack">
        <WeightChart series={series} scale={scale} hoverDay={hoverDay} onHover={setHoverDay} pinnedDay={selected} onPick={onSelect} showAxis={false} />
        <IntakeChart series={series} scale={scale} hoverDay={hoverDay} onHover={setHoverDay} pinnedDay={selected} onPick={onSelect} showAxis={false} />
        <NutrientChart
          series={series} scale={scale} hoverDay={hoverDay} onHover={setHoverDay}
          pinnedDay={selected} onPick={onSelect} showAxis
          label="Protein" field="protein" target={series.targets.daily_protein_g} unit="grams"
        />
      </div>

      <p className="viz-caption">
        Logged intake and measured weight over the same dates. Some days have no
        food record, and weight moves with hydration, sleep and time of day.
        Read these as two records side by side, not as cause and effect.
      </p>
    </div>
  );
}
