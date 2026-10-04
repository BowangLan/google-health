import { centredMean, runs } from "@/features/trends/lib/series";
import { niceStep, type DayScale } from "@/features/trends/lib/scale";
import type { Series } from "@/lib/types";
import { ChartFrame } from "@/features/trends/components/charts/chart-frame";
import { EmptyPanel } from "@/features/trends/components/charts/empty-panel";

const HEIGHT = 230;
const PAD = { top: 14, bottom: 8 };
/** Below this the chart must not auto-scale a flat week into a mountain. */
const MIN_SPAN = { kg: 4, lb: 9 };

export function WeightChart({ series, scale, hoverDay, onHover, pinnedDay, onPick, showAxis }: {
  series: Series;
  scale: DayScale;
  hoverDay: string | null;
  onHover: (day: string | null) => void;
  pinnedDay: string | null;
  onPick: (day: string) => void;
  showAxis: boolean;
}) {
  const readings = series.rows.filter((row) => row.weight !== null);

  if (readings.length === 0) {
    return <EmptyPanel title="Weight" message="No weight readings in this range." />;
  }
  if (readings.length < 7) {
    // A seven-day mean over fewer than seven points is noise in a trend's
    // clothing, so the line is withheld and only the evidence is drawn.
    return (
      <EmptyPanel
        title="Weight"
        message={`${readings.length} reading${readings.length === 1 ? "" : "s"} in this range. The trend line appears at seven.`}
      />
    );
  }

  const trend = centredMean(series.rows);
  const values = readings.map((row) => row.weight as number);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const floor = MIN_SPAN[series.unit];
  const centre = (low + high) / 2;
  const half = Math.max((high - low) * 0.58, floor / 2);
  const step = niceStep(half * 2, 4);
  const min = Math.floor((centre - half) / step) * step;
  const max = Math.ceil((centre + half) / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + 1e-9; value += step) ticks.push(Number(value.toFixed(3)));

  const hovered = hoverDay ? series.rows.find((row) => row.day === hoverDay) : undefined;
  const hoveredTrend = hoverDay ? trend.find((point) => point.day === hoverDay) : undefined;

  return (
    <ChartFrame
      title="Weight"
      subtitle={`${series.coverage.days_weighed} of ${series.coverage.days_in_range} days weighed · ${series.unit}`}
      scale={scale}
      height={HEIGHT}
      pad={PAD}
      yTicks={ticks}
      format={(value) => value.toFixed(1)}
      hoverDay={hoverDay}
      onHover={onHover}
      pinnedDay={pinnedDay}
      onPick={onPick}
      showAxis={showAxis}
      note={
        <>
          Dots are readings; the line is a centred seven-day average. It breaks
          where more than a week passed without one.
        </>
      }
    >
      {({ y, top, bottom }) => (
        <>
          {/* A gap is drawn as absence, never interpolated across. */}
          {series.gaps.map((gap) => {
            const x1 = scale.x(gap.from) - scale.band / 2;
            const x2 = scale.x(gap.to) + scale.band / 2;
            return (
              <g key={gap.from}>
                <rect className="viz-gap fill-white opacity-[0.03]" x={x1} y={top} width={Math.max(x2 - x1, 1)} height={bottom - top} />
                {x2 - x1 > 48 && (
                  <text className="viz-tick fill-chart-tick [font-family:var(--sans)] text-[10px]" x={(x1 + x2) / 2} y={top + 12} textAnchor="middle">
                    no readings · {gap.days}d
                  </text>
                )}
              </g>
            );
          })}

          {readings.map((row) => (
            <circle key={row.day} className="viz-raw fill-weight opacity-[0.6]" r={2.2}
              cx={scale.x(row.day)} cy={y(row.weight as number)} />
          ))}

          {runs(trend).map((run, index) => {
            // The settled part, then the provisional tail drawn from the last
            // settled point so the two meet without doubling a segment.
            const firstProvisional = run.findIndex((point) => point.provisional);
            const settled = firstProvisional === -1 ? run : run.slice(0, firstProvisional);
            const tail = firstProvisional === -1
              ? []
              : run.slice(Math.max(firstProvisional - 1, 0));
            const path = (points: typeof run) => points
              .map((p, i) => `${i ? "L" : "M"}${scale.x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`)
              .join(" ");
            return (
              <g key={index}>
                {settled.length > 1 && <path className="viz-series fill-none stroke-weight [stroke-width:2.25] [stroke-linecap:round] [stroke-linejoin:round] [&.provisional]:opacity-[0.55]" d={path(settled)} />}
                {tail.length > 1 && <path className="viz-series fill-none stroke-weight [stroke-width:2.25] [stroke-linecap:round] [stroke-linejoin:round] [&.provisional]:opacity-[0.55] provisional" d={path(tail)} />}
              </g>
            );
          })}

          {hovered?.weight !== undefined && hovered?.weight !== null && (
            <circle className="viz-marker fill-weight stroke-card [stroke-width:2] [&.trend]:fill-white" r={4} cx={scale.x(hovered.day)} cy={y(hovered.weight)} />
          )}
          {hoveredTrend && (
            <circle className="viz-marker fill-weight stroke-card [stroke-width:2] [&.trend]:fill-white trend" r={4}
              cx={scale.x(hoveredTrend.day)} cy={y(hoveredTrend.value)} />
          )}
        </>
      )}
    </ChartFrame>
  );
}
