import { cn } from "@/lib/utils";
import { Button } from "@/components/button";
import { useEffect, useState } from "react";
import { useJournal } from "@/features/journal/hooks/use-journal";
import { parseDay, relativeDay, shiftDay } from "@/lib/format";
import { dashboardHref } from "@/lib/navigation";
import type { FoodRow, RunCommand, Targets } from "@/lib/types";
import { IconAdd, IconLedger, IconNext, IconPrev, IconWeight } from "@/lib/icons";
import { DatePicker } from "@/features/journal/components/date-picker";
import { Day } from "@/features/journal/components/day";
import { Dialog } from "@/components/dialog";
import { FoodComposer } from "@/features/journal/components/food-composer";
import { WeightComposer } from "@/features/journal/components/weight-composer";
import { TrendsSection } from "@/features/trends/components/trends-section";

type Entry = { kind: "food"; source?: FoodRow } | { kind: "weight" } | null;

/**
 * One page. The selected day drives the left column (totals, weight, meals)
 * and the pinned column in every chart on the right. Picking a day anywhere,
 * from the arrows, the calendar or a chart, changes both.
 */
export function Dashboard({
  day,
  days,
  today,
  unit,
  targets,
  revision,
  navigate,
  run,
  onChanged,
  onSync,
}: {
  day: string;
  days: number;
  today: string;
  unit: "kg" | "lb";
  targets: Targets;
  revision: number;
  navigate: (href: string, replace?: boolean) => void;
  run: RunCommand;
  onChanged: (message: string) => Promise<void>;
  onSync: () => void;
}) {
  const journal = useJournal(day, revision);
  const [calendar, setCalendar] = useState(false);
  const [entry, setEntry] = useState<Entry>(null);
  const go = (date: string | null, replace = false) =>
    navigate(dashboardHref(date === today ? null : date, days), replace);
  const choose = (date: string) => {
    setCalendar(false);
    go(date);
  };
  const fullDate = parseDay(day).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        document.querySelector("dialog[open]") ||
        target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const step = (by: number) => () =>
        navigate(dashboardHref(shiftDay(day, by), days));
      const actions: Record<string, () => void> = {
        ArrowLeft: step(-1),
        ArrowRight: step(1),
        ArrowUp: step(-7),
        ArrowDown: step(7),
        t: () => navigate(dashboardHref(null, days)),
        d: () => setCalendar(true),
        f: () => setEntry({ kind: "food" }),
        "/": () => setEntry({ kind: "food" }),
        w: () => setEntry({ kind: "weight" }),
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [day, days, navigate]);

  return (
    <div className="dashboard grid gap-5.5">
      <header className="day-header flex items-end justify-between flex-wrap gap-y-4 gap-x-6" aria-label="Selected day and logging">
        <div className={cn(
          "day-title [&_h1]:[font:650_34px/1.08_var(--display)] [&_h1]:tracking-[-0.028em] [&_time]:block [&_time]:mt-1",
          "[&_time]:text-muted-foreground [&_time]:text-[14px] [&_time]:tracking-[-0.01em] max-[761px]:[&_h1]:text-[28px]"
        )}>
          <h1>{relativeDay(day, today)}</h1>
          <time dateTime={day}>{fullDate}</time>
        </div>
        <div className="day-controls flex items-center flex-wrap gap-2.5 max-[761px]:w-full">
          <div className="day-stepper flex items-center p-0.5 border border-solid border-input rounded-full [background:rgb(255_255_255_/_0.03)]">
            <Button
              variant="step"
              aria-label="Previous day"
              onClick={() => choose(shiftDay(day, -1))}
            >
              <IconPrev aria-hidden />
            </Button>
            <button
              className={cn(
                "date-trigger inline-flex items-center gap-[7px] h-8 py-0 px-3 border-0 rounded-full bg-transparent",
                "text-foreground font-[590] text-[13px] [&_svg]:text-muted-foreground",
                "pointer-hover:[&:hover]:[background:rgb(255_255_255_/_0.08)] pointer-hover:[&:hover]:text-foreground"
              )}
              aria-label={"Choose date, " + fullDate}
              aria-haspopup="dialog"
              onClick={() => setCalendar(true)}
            >
              <IconLedger size={15} aria-hidden />
              <span aria-hidden>
                {parseDay(day).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </button>
            <Button
              variant="step"
              aria-label="Next day"
              onClick={() => choose(shiftDay(day, 1))}
            >
              <IconNext aria-hidden />
            </Button>
          </div>
          {day !== today && (
            <a className={cn(
              "today-action active:[transform:scale(0.97)] inline-flex items-center min-h-[32px] py-0 px-3.5 rounded-full border border-solid border-input",
              "text-foreground text-[12px] font-[590]",
              "[transition:transform_140ms_var(--ease-out),_background-color_140ms_ease]",
              "pointer-hover:[&:hover]:[background:rgb(255_255_255_/_0.1)] max-[761px]:ml-auto"
            )} href={dashboardHref(null, days)}>
              Today
            </a>
          )}
          <div className="log-actions flex gap-2 max-[761px]:w-full max-[761px]:[&_button]:[flex:1] max-[761px]:[&_kbd]:hidden">
            <Button
              variant="secondary"
              onClick={() => setEntry({ kind: "weight" })}
            >
              <IconWeight size={15} aria-hidden />
              Log weight
            </Button>
            <Button variant="primary" onClick={() => setEntry({ kind: "food" })}>
              <IconAdd size={15} aria-hidden />
              Log food<kbd aria-hidden>F</kbd>
            </Button>
          </div>
        </div>
      </header>
      {day !== today && (
        <p className="date-context [margin-top:-10px] text-warning text-[12px]">
          New weight entries will be logged to {fullDate}. Food defaults to today;
          choose its date in the food form.
        </p>
      )}
      <div className="dashboard-grid grid grid-cols-[minmax(360px,_5fr)_minmax(0,_7fr)] gap-5 items-start max-[1181px]:grid-cols-[minmax(0,_1fr)]">
        <div className="dashboard-day min-w-0">
          {journal.error ? (
            <div className={cn(
              "errorcard border border-solid border-[rgb(245_184_92_/_0.3)] bg-warning-muted rounded-[var(--r-tile)] p-5.5",
              "grid gap-3.5 text-[13px] [&_h2]:text-[16px] [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
              "[&_pre]:[font:11.5px/1.6_var(--mono)] [&_pre]:text-muted-foreground [&_.secondary]:justify-self-start"
            )} role="alert">
              <h2>This day couldn’t be loaded.</h2>
              <pre>{journal.error}</pre>
              <Button variant="secondary" onClick={journal.retry}>
                Try again
              </Button>
            </div>
          ) : journal.view ? (
            <Day
              view={journal.view}
              targets={targets}
              loading={journal.loading}
              onAddFood={() => setEntry({ kind: "food" })}
              onAddWeight={() => setEntry({ kind: "weight" })}
              onReuse={(source) => setEntry({ kind: "food", source })}
              onChanged={(message) => {
                void onChanged(message);
              }}
              onSync={onSync}
            />
          ) : (
            <div className={cn(
              "day-loading grid gap-3 [&_i]:block [&_i]:h-30 [&_i]:rounded-[var(--r-tile)] [&_i]:bg-card [&_i]:border",
              "[&_i]:border-solid [&_i]:border-border [&_i]:animate-[breathe_1.6s_ease-in-out_infinite]",
              "[&_i:first-child]:h-57.5 [&_i:last-child]:h-70"
            )} role="status" aria-label="Loading day">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <TrendsSection
          unit={unit}
          days={days}
          selectedDay={day}
          revision={revision}
          onSelect={(picked) => go(picked, true)}
          onRange={(range) =>
            navigate(dashboardHref(day === today ? null : day, range))
          }
        />
      </div>
      {calendar && (
        <DatePicker
          day={day}
          today={today}
          targets={targets}
          onPick={choose}
          onClose={() => setCalendar(false)}
        />
      )}
      {entry && (
        <Dialog
          title={
            entry.kind === "food"
              ? entry.source
                ? "Reuse food"
                : "Log food"
              : "Log weight"
          }
          onClose={() => setEntry(null)}
        >
          {entry.kind === "food" ? (
            <FoodComposer
              today={today}
              source={entry.source}
              run={run}
              onClose={() => setEntry(null)}
              onLogged={(name, loggedDay, at) => {
                setEntry(null);
                go(loggedDay);
                const loggedDate = parseDay(loggedDay).toLocaleDateString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                });
                void onChanged(
                  "Logged " + name + " · " + loggedDate + (at ? " · " + at : ""),
                );
              }}
            />
          ) : (
            <WeightComposer
              day={day}
              today={today}
              unit={unit}
              run={run}
              onClose={() => setEntry(null)}
              onLogged={() => {
                setEntry(null);
                void onChanged("Weight logged · " + fullDate);
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}
