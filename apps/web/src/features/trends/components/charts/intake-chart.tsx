import { cn } from "@/lib/utils";
import { macroEnergy, runs } from "@/features/trends/lib/series";
import { niceStep, type DayScale } from "@/features/trends/lib/scale";
import type { Series } from "@/lib/types";
import { ChartFrame } from "@/features/trends/components/charts/chart-frame";
import { EmptyPanel } from "@/features/trends/components/charts/empty-panel";

const HEIGHT = 200;
const PAD = { top: 12, bottom: 8 };

/**
 * Eaten and burned on one axis. Eaten is a column per day, stacked from macro
 * energy, so total and composition read in one mark. Burned is a line over
 * the columns. Wherever a column rises above that day's burn, the excess is
 * highlighted: that part is the surplus. The calorie goal is a dotted line
 * for reference only; going over it is not highlighted.
 */
export function IntakeChart({
  series,
  scale,
  hoverDay,
  onHover,
  pinnedDay,
  onPick,
  showAxis,
}: {
  series: Series;
  scale: DayScale;
  hoverDay: string | null;
  onHover: (day: string | null) => void;
  pinnedDay: string | null;
  onPick: (day: string) => void;
  showAxis: boolean;
}) {
  const logged = series.rows.filter((row) => row.kcal !== null);
  const burnedDays = series.rows.filter((row) => row.burned !== null);
  if (logged.length === 0 && burnedDays.length === 0) {
    return (
      <EmptyPanel title="Calories" message="No food logged or calories burned in this range." />
    );
  }

  const target = series.targets.daily_kcal;
  const peak = Math.max(
    ...logged.map((row) => row.kcal as number),
    ...burnedDays.map((row) => row.burned as number),
    target ?? 0,
  );
  const step = niceStep(peak * 1.1, 4);
  const max = Math.ceil((peak * 1.08) / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(value);

  const width = Math.max(0.5, Math.min(22, scale.band * 0.72));
  const coverage = `${series.coverage.days_logged} of ${series.coverage.days_in_range} days logged`;
  const burnedRuns = runs(
    burnedDays.map((row) => ({ day: row.day, value: row.burned as number })),
    1,
  );

  return (
    <ChartFrame
      title="Calories"
      subtitle={
        <>
          {coverage}
          <span className={cn(
            "macro-legend inline-flex flex-wrap gap-y-1 gap-x-2.5 ml-3 [&_span]:inline-flex [&_span]:items-center",
            "[&_span]:gap-[5px] [&_span::before]:[content:''] [&_span::before]:w-[7px] [&_span::before]:h-[7px]",
            "[&_span::before]:rounded-[2px] [&_span::before]:[background:currentColor] [&_.protein]:text-protein",
            "[&_.carbs]:text-carbs [&_.fat]:text-fat [&_.unaccounted]:[color:#8e8e93] [&_.over]:text-over",
            "[&_.burned]:text-energy [&_.burned::before]:h-0.5 [&_.burned::before]:w-3 [&_.burned::before]:rounded-[2px]",
            "[&_.goal]:text-muted-foreground [&_.goal::before]:h-0 [&_.goal::before]:w-3 [&_.goal::before]:rounded-[0]",
            "[&_.goal::before]:bg-none [&_.goal::before]:bg-transparent [&_.goal::before]:border-t-[1.5px] [&_.goal::before]:[border-top-style:dashed]",
            "[&_.goal::before]:border-t-[currentColor] max-[761px]:flex max-[761px]:[margin:4px_0_0]"
          )}>
            <span className="protein">Protein</span>
            <span className="carbs">Carbs</span>
            <span className="fat">Fat</span>
            <span className="unaccounted">Other</span>
            <span className="burned">Burned</span>
            <span className="over">Over burned</span>
            {target !== null && <span className="goal">Goal</span>}
          </span>
        </>
      }
      scale={scale}
      height={HEIGHT}
      pad={PAD}
      yTicks={ticks}
      format={(value) => value.toLocaleString()}
      hoverDay={hoverDay}
      onHover={onHover}
      pinnedDay={pinnedDay}
      onPick={onPick}
      showAxis={showAxis}
      note={
        <>
          {series.coverage.days_logged < series.coverage.days_in_range * 0.9 &&
            "Empty slots are days with no food record, not days of no eating. "}
          {series.rows[series.rows.length - 1]?.burned != null &&
            "Today’s burn is still accumulating."}
        </>
      }
    >
      {({ y, bottom }) => (
        <>
          {target !== null && (
            <>
              <line
                className="viz-target stroke-subtle [stroke-width:1] [stroke-dasharray:4_3]"
                x1={scale.left}
                x2={scale.width - scale.right}
                y1={y(target)}
                y2={y(target)}
              />
              <text
                className="viz-tick fill-chart-tick [font-family:var(--sans)] text-[10px]"
                x={scale.width - scale.right + 4}
                y={y(target) + 3.5}
              >
                goal
              </text>
            </>
          )}
          {series.rows.map((row) => {
            const x = scale.x(row.day) - width / 2;
            if (row.kcal === null) {
              // A day with nothing logged is a mark of its own, so it cannot be
              // misread as a day of eating nothing.
              return (
                <rect
                  key={row.day}
                  className="viz-unlogged fill-subtle opacity-[0.35]"
                  x={x}
                  y={bottom - 1.5}
                  width={width}
                  height={1.5}
                />
              );
            }
            const energy = macroEnergy(row);
            const parts: [string, number][] = [
              ["protein", energy.protein],
              ["carbs", energy.carbs],
              ["fat", energy.fat],
              ["unaccounted", energy.unaccounted],
            ];
            let cursor = 0;
            const total = row.kcal;
            const scaleTo =
              total > 0
                ? total /
                Math.max(
                  parts.reduce((s, [, v]) => s + v, 0),
                  1,
                )
                : 1;
            return (
              <g
                key={row.day}
                className={hoverDay === row.day ? "viz-col [&.hovered_.viz-seg]:[filter:brightness(1.25)] hovered" : "viz-col [&.hovered_.viz-seg]:[filter:brightness(1.25)]"}
              >
                {parts.map(([name, raw]) => {
                  const value = raw * scaleTo;
                  if (value <= 0) return null;
                  const yTop = y(cursor + value);
                  const height = Math.max(y(cursor) - yTop - 1, 0.5);
                  cursor += value;
                  return (
                    <rect
                      key={name}
                      className={`viz-seg [&.protein]:fill-protein [&.carbs]:fill-carbs [&.fat]:fill-fat [&.unaccounted]:fill-other [&.hovered]:[filter:brightness(1.25)] ${name}`}
                      x={x}
                      y={yTop}
                      width={width}
                      height={height}
                    />
                  );
                })}
                {row.burned !== null && total > row.burned && (
                  <rect
                    className="viz-over fill-over [fill-opacity:0.55] stroke-over [stroke-width:1]"
                    x={x}
                    y={y(total)}
                    width={width}
                    height={Math.max(y(row.burned) - y(total), 1)}
                  />
                )}
              </g>
            );
          })}
          {burnedRuns.map((run) =>
            run.length > 1 ? (
              <path
                key={run[0]!.day}
                className="viz-burned fill-none stroke-energy [stroke-width:2] [stroke-linejoin:round] [stroke-linecap:round]"
                d={run
                  .map((p, i) => `${i ? "L" : "M"}${scale.x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`)
                  .join(" ")}
              />
            ) : (
              <circle
                key={run[0]!.day}
                className="viz-burned-point fill-energy"
                r={2.5}
                cx={scale.x(run[0]!.day)}
                cy={y(run[0]!.value)}
              />
            ),
          )}
        </>
      )}
    </ChartFrame>
  );
}
