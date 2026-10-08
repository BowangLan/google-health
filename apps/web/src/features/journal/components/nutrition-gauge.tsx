import { Gauge } from "@/design-system/primitives/gauge/gauge";
import { GaugeArc, GaugeTrack } from "@/design-system/primitives/gauge/arcs";
import { GaugeText, GaugeValue } from "@/design-system/primitives/gauge/text";
import { num } from "@/lib/format";

type NutritionGaugeProps = {
  consumed: number;
  /** Configured daily calorie goal. */
  energyTarget: number | null;
};

export function NutritionGauge({ consumed, energyTarget }: NutritionGaugeProps) {
  const amount = Number.isFinite(consumed) ? consumed : null;
  const target =
    energyTarget !== null && Number.isFinite(energyTarget) && energyTarget > 0
      ? energyTarget
      : null;
  const ratio = amount !== null && target !== null ? amount / target : null;
  const over = ratio !== null && ratio > 1;
  const status =
    amount === null
      ? "Reading unavailable"
      : ratio === null
        ? "No target"
        : over
          ? `${num(amount - target!)} kcal over target`
          : `${Math.round(ratio * 100)}% of target`;
  const foreground = "var(--ds-color-text)";

  return (
    <dl className="m-0 min-w-0" aria-label="Calorie progress">
      <dt className="sr-only">Calories eaten</dt>
      <dd className="m-0 mx-auto max-w-[280px]">
        <Gauge
          value={amount ?? 0}
          min={0}
          max={target ?? Math.max(amount ?? 0, 1)}
          startAngle={180}
          endAngle={540}
          radius={200}
          padding={56}
          transition={{ type: "spring", visualDuration: 0.5, bounce: 0.1 }}
          role="img"
          aria-label={
            amount === null
              ? "Calories eaten unavailable"
              : `${num(amount)} kcal consumed, ${target === null ? "no target" : `${num(target)} kcal target`}`
          }
          focusable="false"
        >
          <GaugeTrack width={44} color={foreground} opacity={0.12} cap="round" offset={0} />
          {ratio !== null && (
            <GaugeArc width={44} color={foreground} opacity={1} cap="round" offset={0} />
          )}
          {amount === null ? (
            <GaugeText x={0} y={-12} fontSize={30} color={foreground} font="rounded" weight="bold">
              Unavailable
            </GaugeText>
          ) : (
            <GaugeValue
              x={0}
              y={-12}
              fontSize={80}
              color={foreground}
              font="rounded"
              weight="bold"
              decimals={0}
              // The ring clamps at the goal; the number still shows all intake.
              format={(value) => num(over ? amount : value) ?? ""}
            />
          )}
          <GaugeText x={0} y={60} fontSize={24} color="var(--ds-color-text-muted)" font="rounded" weight="medium">
            kcal
          </GaugeText>
          <GaugeText x={0} y={-80} fontSize={22} color={foreground} font="rounded" weight="semibold">
            Calories eaten
          </GaugeText>
        </Gauge>
      </dd>
      <dd className="m-0 mt-3 text-center text-ui-label leading-5 text-muted-foreground tabular-nums">
        {target !== null && (
          <span className="block">{num(target)} kcal target</span>
        )}
        <span className={over ? "block font-medium text-over" : "block"}>
          {status}
        </span>
      </dd>
    </dl>
  );
}
