import type { ReactNode } from "react";
import type { DayScale } from "@/features/trends/lib/scale";

/**
 * The shared shell: grid, y labels, the hover hit layer, and the crosshair.
 * Every chart in a stack gets the same DayScale instance, so their gutters and
 * pixels-per-day match exactly and a column lines up with the point above it.
 */
export function ChartFrame({
  title,
  subtitle,
  scale,
  height,
  pad,
  yTicks,
  format,
  hoverDay,
  onHover,
  pinnedDay,
  onPick,
  showAxis,
  children,
  note,
}: {
  title: string;
  subtitle?: ReactNode;
  scale: DayScale;
  height: number;
  pad: { top: number; bottom: number };
  yTicks: number[];
  format: (value: number) => string;
  hoverDay: string | null;
  onHover: (day: string | null) => void;
  pinnedDay: string | null;
  onPick: (day: string) => void;
  showAxis: boolean;
  children: (plot: {
    y: (value: number) => number;
    top: number;
    bottom: number;
  }) => ReactNode;
  note?: ReactNode;
}) {
  const top = pad.top;
  const bottom = height - pad.bottom;
  const min = yTicks[0] ?? 0;
  const max = yTicks[yTicks.length - 1] ?? 1;
  const y = (value: number) =>
    bottom - ((value - min) / (max - min || 1)) * (bottom - top);

  return (
    <figure className="viz m-0 [&_+_.viz]:mt-1">
      <figcaption className="viz-head flex flex-wrap items-baseline gap-y-1 gap-x-2.5 [padding:12px_18px_2px]">
        <span className="viz-title text-[12px] font-semibold">{title}</span>
        {subtitle && <span className="viz-sub text-subtle text-[11.5px]">{subtitle}</span>}
      </figcaption>
      <svg
        viewBox={`0 0 ${scale.width} ${height}`}
        className="viz-svg block w-full h-auto cursor-pointer overflow-visible"
        role="img"
        aria-label={
          title +
          " over the selected range. Click a day to select it, or use the date controls."
        }
        preserveAspectRatio="none"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const local = ((event.clientX - box.left) / box.width) * scale.width;
          onHover(scale.dayAt(local));
        }}
        onPointerLeave={() => onHover(null)}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const local = ((event.clientX - box.left) / box.width) * scale.width;
          onPick(scale.dayAt(local));
        }}
      >
        {/* Horizontal only: the crosshair is the vertical reference. */}
        {yTicks.map((value) => (
          <g key={value}>
            <line
              className="viz-grid stroke-chart-grid [stroke-width:1]"
              x1={scale.left}
              x2={scale.width - scale.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              className="viz-tick fill-chart-tick [font-family:var(--sans)] text-[10px]"
              x={scale.left - 8}
              y={y(value) + 3.5}
              textAnchor="end"
            >
              {format(value)}
            </text>
          </g>
        ))}

        {children({ y, top, bottom })}

        {/* A pinned day survives the pointer leaving, which is what makes the
            action on it clickable at all. */}
        {pinnedDay && (
          <line
            className="viz-crosshair stroke-chart-crosshair [stroke-width:1] [&.pinned]:stroke-white [&.pinned]:opacity-[0.65] [&.pinned]:[stroke-dasharray:3_3] pinned"
            x1={scale.x(pinnedDay)}
            x2={scale.x(pinnedDay)}
            y1={top}
            y2={bottom}
          />
        )}
        {hoverDay && hoverDay !== pinnedDay && (
          <line
            className="viz-crosshair stroke-chart-crosshair [stroke-width:1] [&.pinned]:stroke-white [&.pinned]:opacity-[0.65] [&.pinned]:[stroke-dasharray:3_3]"
            x1={scale.x(hoverDay)}
            x2={scale.x(hoverDay)}
            y1={top}
            y2={bottom}
          />
        )}

        {showAxis &&
          scale.ticks().map((day) => (
            <text
              key={day}
              className="viz-tick fill-chart-tick [font-family:var(--sans)] text-[10px]"
              x={scale.x(day)}
              y={height - 6}
              textAnchor="middle"
            >
              {new Date(`${day}T12:00:00`).toLocaleDateString([], {
                day: "numeric",
                month: "short",
              })}
            </text>
          ))}
      </svg>
      {note && <div className="viz-note [padding:2px_18px_6px] text-subtle text-[11.5px]">{note}</div>}
    </figure>
  );
}
