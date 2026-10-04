"use client";

/**
 * @author: @kokonutui
 * @description: Apple Activity Card, adapted for live nutrition data and overflow
 * @version: 1.0.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { useEffect, useId, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ActivityData {
  label: string;
  value: number | null;
  color: string;
  endColor?: string;
  size: number;
  current: number;
  target: number | null;
  unit: string;
}

const activities: ActivityData[] = [
  { label: "MOVE", value: 85, color: "#FF2D55", size: 200, current: 479, target: 800, unit: "CAL" },
  { label: "EXERCISE", value: 60, color: "#A3F900", size: 160, current: 24, target: 30, unit: "MIN" },
  { label: "STAND", value: 30, color: "#04C7DD", size: 120, current: 6, target: 12, unit: "HR" },
];

function subscribeInputMode(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-input"] });
  return () => observer.disconnect();
}

function CircleProgress({ data, index, ringSize, strokeWidth, reduceMotion }: {
  data: ActivityData;
  index: number;
  ringSize: number;
  strokeWidth: number;
  reduceMotion: boolean;
}) {
  const radius = (data.size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const target = Math.max(0, data.value ?? 0);
  const progress = useMotionValue(reduceMotion ? target : 0);
  // Animate one total: the next lap cannot start before the first completes.
  const firstOffset = useTransform(progress, (value) => circumference * (1 - Math.min(value, 100) / 100));
  const lapOffset = useTransform(progress, (value) => circumference * (1 - (Math.max(value - 100, 0) % 100) / 100));
  const firstOpacity = useTransform(progress, (value) => value > 0 ? 1 : 0);
  const lapOpacity = useTransform(progress, (value) => value > 100 ? 1 : 0);
  const headX = useTransform(progress, (value) => data.size / 2 + radius * Math.cos(value * Math.PI / 50));
  const headY = useTransform(progress, (value) => data.size / 2 + radius * Math.sin(value * Math.PI / 50));
  const gradientId = `activity-gradient-${useId()}`;
  const shadowId = `activity-shadow-${useId()}`;
  const gradientUrl = `url(#${gradientId})`;
  const endColor = data.endColor ?? (data.color === "#FF2D55" ? "#FF6B8B" : data.color === "#A3F900" ? "#C5FF4D" : "#4DDFED");

  useEffect(() => {
    if (reduceMotion) {
      progress.set(target);
      return;
    }
    const animation = animate(progress, target, {
      duration: 1.8, delay: index * 0.2, ease: "easeInOut",
    });
    return () => animation.stop();
  }, [progress, target, index, reduceMotion]);

  const circle = {
    cx: data.size / 2, cy: data.size / 2, r: radius,
    fill: "none", strokeWidth, strokeLinecap: "round" as const,
    strokeDasharray: circumference,
  };

  return (
    <div
      className={cn("activity-ring absolute inset-0 flex items-center justify-center", data.label.toLowerCase())}
    >
      <svg
        width={data.size} height={data.size}
        viewBox={`0 0 ${data.size} ${data.size}`}
        style={{ width: `${data.size / ringSize * 100}%`, height: "auto" }}
        className="-rotate-90 overflow-visible"
        role="img"
        aria-label={`${data.label} Activity Progress - ${data.value === null ? "target unavailable" : `${Math.round(data.value)}%`}`}
      >
        <title>{`${data.label} Activity Progress - ${data.value === null ? "target unavailable" : `${Math.round(data.value)}%`}`}</title>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={data.color} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
          <filter id={shadowId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        <circle {...circle} className="ring-track text-zinc-200/50 dark:text-zinc-800/50" stroke="currentColor" />
        <motion.circle {...circle} className="ring-value" stroke={gradientUrl}
          style={{ strokeDashoffset: firstOffset, opacity: firstOpacity }} />
        {/* Only the leading tip casts a shadow; the new arc covers the old lap. */}
        <motion.circle className="ring-head" r={strokeWidth / 2} fill="rgba(0,0,0,0.6)"
          filter={`url(#${shadowId})`} style={{ cx: headX, cy: headY, opacity: lapOpacity }} />
        <motion.circle {...circle} className="ring-value ring-lap" stroke={gradientUrl}
          style={{ strokeDashoffset: lapOffset, opacity: lapOpacity }} />
      </svg>
    </div>
  );
}

function DetailedActivityInfo({ activities }: { activities: ActivityData[] }) {
  return (
    <div className="flex flex-col gap-6">
      {activities.map((activity) => (
        <div key={activity.label} className="flex flex-col">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{activity.label}</span>
          <span className="text-2xl font-semibold" style={{ color: activity.color }}>
            {activity.current}{activity.target === null ? "" : `/${activity.target}`}
            <span className="ml-1 text-base text-zinc-600 dark:text-zinc-400">{activity.unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function AppleActivityCard({ title = "Activity Rings", className, activities: data = activities,
  ringSize = 200, strokeWidth = 16, compact = false, children }: {
    title?: string | null;
    className?: string;
    activities?: ActivityData[];
    ringSize?: number;
    strokeWidth?: number;
    compact?: boolean;
    children?: ReactNode;
  }) {
  const keyboard = useSyncExternalStore(subscribeInputMode,
    () => document.documentElement.dataset.input === "keyboard", () => false);
  const reduceMotion = Boolean(useReducedMotion()) || keyboard;
  return (
    <div className={cn(compact ? "rings-body grid grid-cols-[132px_minmax(0,_1fr)] items-center gap-6 [padding:14px_18px_6px] max-[761px]:grid-cols-[112px_minmax(0,_1fr)] max-[761px]:gap-4.5 max-[381px]:grid-cols-[minmax(0,_1fr)] max-[381px]:justify-items-center" : "relative mx-auto w-full max-w-3xl rounded-3xl p-8 text-zinc-900 dark:text-white", className)}>
      {title && <h2 className="mb-8 text-center text-2xl font-medium">{title}</h2>}
      <div className={compact ? "contents" : "flex flex-col items-center justify-center gap-8 sm:flex-row"}>
        <div className="rings w-[var(--activity-ring-size)] [aspect-ratio:1] max-[761px]:w-28 max-[761px]:h-28 relative shrink-0" style={{ "--activity-ring-size": `${ringSize}px`, maxWidth: "100%" } as CSSProperties}>
          {data.map((activity, index) => <CircleProgress key={activity.label} data={activity} index={index}
            ringSize={ringSize} strokeWidth={strokeWidth} reduceMotion={reduceMotion} />)}
        </div>
        {children ?? <DetailedActivityInfo activities={data} />}
      </div>
    </div>
  );
}
