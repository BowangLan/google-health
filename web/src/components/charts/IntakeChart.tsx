import { macroEnergy } from "../../lib/series";
import { niceStep, type DayScale } from "../../lib/scale";
import type { Series } from "../../lib/types";
import { ChartFrame, EmptyPanel } from "./ChartFrame";

const HEIGHT = 170;
const PAD = { top: 12, bottom: 8 };

/**
 * Columns, not a line: calories per day is a counted total with a meaningful
 * zero, and a line would assert a value between the days. Each column is
 * stacked from macro energy, so total and composition read in one mark.
 */
export function IntakeChart({ series, scale, hoverDay, onHover, pinnedDay, onPick, showAxis }: {
  series: Series;
  scale: DayScale;
  hoverDay: string | null;
  onHover: (day: string | null) => void;
  pinnedDay: string | null;
  onPick: (day: string) => void;
  showAxis: boolean;
}) {
  const logged = series.rows.filter((row) => row.kcal !== null);
  if (logged.length === 0) {
    return <EmptyPanel title="Calories" message="No food logged in this range." />;
  }

  const target = series.targets.daily_kcal;
  const peak = Math.max(...logged.map((row) => row.kcal as number), target ?? 0);
  const step = niceStep(peak * 1.1, 4);
  const max = Math.ceil((peak * 1.08) / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(value);

  const width = Math.max(1.5, Math.min(22, scale.band * 0.72));
  const coverage = `${series.coverage.days_logged} of ${series.coverage.days_in_range} days logged`;

  return (
    <ChartFrame
      title="Calories"
      subtitle={coverage}
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
        series.coverage.days_logged < series.coverage.days_in_range * 0.9
          ? <>Empty slots are days with no food record, not days of no eating.</>
          : undefined
      }
    >
      {({ y, bottom }) => (
        <>
          {series.rows.map((row) => {
            const x = scale.x(row.day) - width / 2;
            if (row.kcal === null) {
              // A day with nothing logged is a mark of its own, so it cannot be
              // misread as a day of eating nothing.
              return (
                <rect key={row.day} className="viz-unlogged"
                  x={x} y={bottom - 1.5} width={width} height={1.5} />
              );
            }
            const energy = macroEnergy(row);
            const parts: [string, number][] = [
              ["protein", energy.protein], ["carbs", energy.carbs],
              ["fat", energy.fat], ["unaccounted", energy.unaccounted],
            ];
            let cursor = 0;
            const total = row.kcal;
            const scaleTo = total > 0 ? total / Math.max(parts.reduce((s, [, v]) => s + v, 0), 1) : 1;
            return (
              <g key={row.day} className={hoverDay === row.day ? "viz-col hovered" : "viz-col"}>
                {parts.map(([name, raw]) => {
                  const value = raw * scaleTo;
                  if (value <= 0) return null;
                  const yTop = y(cursor + value);
                  const height = Math.max(y(cursor) - yTop - 1, 0.5);
                  cursor += value;
                  return (
                    <rect key={name} className={`viz-seg ${name}`}
                      x={x} y={yTop} width={width} height={height} />
                  );
                })}
                {target !== null && total > target && (
                  <rect className="viz-over" x={x} y={y(total)} width={width}
                    height={Math.max(y(target) - y(total), 1)} />
                )}
              </g>
            );
          })}

          {target !== null && (
            <>
              <line className="viz-target" x1={scale.left} x2={scale.width - scale.right}
                y1={y(target)} y2={y(target)} />
              <text className="viz-tick" x={scale.width - scale.right + 4} y={y(target) + 3.5}>
                target
              </text>
            </>
          )}
        </>
      )}
    </ChartFrame>
  );
}

/** The same geometry with one segment, for a single nutrient against a target. */
export function NutrientChart({ series, scale, hoverDay, onHover, pinnedDay, onPick, showAxis, label, field, target, unit }: {
  series: Series;
  scale: DayScale;
  hoverDay: string | null;
  onHover: (day: string | null) => void;
  pinnedDay: string | null;
  onPick: (day: string) => void;
  showAxis: boolean;
  label: string;
  field: "protein" | "carbs" | "fat";
  target: number | null;
  unit: string;
}) {
  const logged = series.rows.filter((row) => row[field] !== null);
  if (logged.length === 0) return <EmptyPanel title={label} message="Nothing logged in this range." />;

  const peak = Math.max(...logged.map((row) => row[field] as number), target ?? 0);
  const step = niceStep(peak * 1.1, 3);
  const max = Math.ceil((peak * 1.08) / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(value);
  const width = Math.max(1.5, Math.min(22, scale.band * 0.72));

  return (
    <ChartFrame
      title={label}
      subtitle={unit}
      scale={scale}
      height={showAxis ? 128 : 110}
      pad={{ top: 10, bottom: showAxis ? 26 : 8 }}
      yTicks={ticks}
      format={(value) => String(Math.round(value))}
      hoverDay={hoverDay}
      onHover={onHover}
      pinnedDay={pinnedDay}
      onPick={onPick}
      showAxis={showAxis}
    >
      {({ y, bottom }) => (
        <>
          {series.rows.map((row) => {
            const x = scale.x(row.day) - width / 2;
            const value = row[field];
            if (value === null) {
              return <rect key={row.day} className="viz-unlogged" x={x} y={bottom - 1.5} width={width} height={1.5} />;
            }
            return (
              <rect key={row.day} className={`viz-seg protein${hoverDay === row.day ? " hovered" : ""}`}
                x={x} y={y(value)} width={width} height={Math.max(bottom - y(value), 0.5)} />
            );
          })}
          {target !== null && (
            <line className="viz-target" x1={scale.left} x2={scale.width - scale.right}
              y1={y(target)} y2={y(target)} />
          )}
        </>
      )}
    </ChartFrame>
  );
}
