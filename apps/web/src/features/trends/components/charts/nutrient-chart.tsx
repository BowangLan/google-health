import { niceStep, type DayScale } from "@/features/trends/lib/scale";
import type { Series } from "@/lib/types";
import { ChartFrame } from "./chart-frame";
import { EmptyPanel } from "./empty-panel";
/** The same geometry with one segment, for a single nutrient against a target. */
export function NutrientChart({
  series,
  scale,
  hoverDay,
  onHover,
  pinnedDay,
  onPick,
  showAxis,
  label,
  field,
  target,
  unit,
}: {
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
  if (logged.length === 0)
    return <EmptyPanel title={label} message="Nothing logged in this range." />;

  const peak = Math.max(
    ...logged.map((row) => row[field] as number),
    target ?? 0,
  );
  const step = niceStep(peak * 1.1, 3);
  const max = Math.ceil((peak * 1.08) / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(value);
  const width = Math.max(0.5, Math.min(22, scale.band * 0.72));

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
            return (
              <rect
                key={row.day}
                className={`viz-seg [&.protein]:fill-protein [&.carbs]:fill-carbs [&.fat]:fill-fat [&.unaccounted]:fill-other [&.hovered]:[filter:brightness(1.25)] ${field}${hoverDay === row.day ? " hovered" : ""}`}
                x={x}
                y={y(value)}
                width={width}
                height={Math.max(bottom - y(value), 0.5)}
              />
            );
          })}
          {target !== null && (
            <line
              className="viz-target stroke-subtle [stroke-width:1] [stroke-dasharray:4_3]"
              x1={scale.left}
              x2={scale.width - scale.right}
              y1={y(target)}
              y2={y(target)}
            />
          )}
        </>
      )}
    </ChartFrame>
  );
}
