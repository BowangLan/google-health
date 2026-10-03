import { useEffect, useState } from "react";
import { useJournal } from "../hooks/useJournal";
import { parseDay, relativeDay, shiftDay } from "../lib/format";
import { dashboardHref } from "../lib/navigation";
import type { FoodRow, RunCommand, Targets } from "../lib/types";
import { IconAdd, IconLedger, IconNext, IconPrev, IconWeight } from "../lib/icons";
import { DatePicker } from "./DatePicker";
import { Day } from "./Day";
import { Dialog } from "./Dialog";
import { Composer } from "./Composer";
import { WeightComposer } from "./WeightComposer";
import { Trends } from "./Trends";

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
    <div className="dashboard">
      <header className="day-header" aria-label="Selected day and logging">
        <div className="day-title">
          <h1>{relativeDay(day, today)}</h1>
          <time dateTime={day}>{fullDate}</time>
        </div>
        <div className="day-controls">
          <div className="day-stepper">
            <button
              className="step"
              aria-label="Previous day"
              onClick={() => choose(shiftDay(day, -1))}
            >
              <IconPrev aria-hidden />
            </button>
            <button
              className="date-trigger"
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
            <button
              className="step"
              aria-label="Next day"
              onClick={() => choose(shiftDay(day, 1))}
            >
              <IconNext aria-hidden />
            </button>
          </div>
          {day !== today && (
            <a className="today-action" href={dashboardHref(null, days)}>
              Today
            </a>
          )}
          <div className="log-actions">
            <button
              className="secondary"
              onClick={() => setEntry({ kind: "weight" })}
            >
              <IconWeight size={15} aria-hidden />
              Log weight
            </button>
            <button className="primary" onClick={() => setEntry({ kind: "food" })}>
              <IconAdd size={15} aria-hidden />
              Log food<kbd aria-hidden>F</kbd>
            </button>
          </div>
        </div>
      </header>
      {day !== today && (
        <p className="date-context">
          New weight entries will be logged to {fullDate}. Food defaults to today;
          choose its date in the food form.
        </p>
      )}
      <div className="dashboard-grid">
        <div className="dashboard-day">
          {journal.error ? (
            <div className="errorcard" role="alert">
              <h2>This day couldn’t be loaded.</h2>
              <pre>{journal.error}</pre>
              <button className="secondary" onClick={journal.retry}>
                Try again
              </button>
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
            <div className="day-loading" role="status" aria-label="Loading day">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <Trends
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
            <Composer
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
