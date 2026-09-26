import { useEffect, useState } from "react";
import { useJournal } from "../hooks/useJournal";
import { parseDay, relativeDay, shiftDay } from "../lib/format";
import { journalHref } from "../lib/navigation";
import type { FoodRow, RunCommand, Targets } from "../lib/types";
import {
  IconAdd,
  IconLedger,
  IconNext,
  IconPrev,
  IconWeight,
} from "../lib/icons";
import { DatePicker } from "./DatePicker";
import { JournalEntries } from "./JournalEntries";
import { Dialog } from "./Dialog";
import { Composer } from "./Composer";
import { WeightComposer } from "./WeightComposer";

type Entry = { kind: "food"; source?: FoodRow } | { kind: "weight" } | null;

export function Journal({
  day,
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
  today: string;
  unit: "kg" | "lb";
  targets: Targets;
  revision: number;
  navigate: (href: string) => void;
  run: RunCommand;
  onChanged: (message: string) => Promise<void>;
  onSync: () => void;
}) {
  const journal = useJournal(day, revision);
  const [calendar, setCalendar] = useState(false);
  const [entry, setEntry] = useState<Entry>(null);
  const choose = (date: string) => {
    setCalendar(false);
    navigate(journalHref(date));
  };
  const fullDate = parseDay(day).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // These shortcuts live with their page. They cannot move a hidden journal
  // while someone is inspecting Trends or editing a record in a dialog.
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
      const actions: Record<string, () => void> = {
        ArrowLeft: () => navigate(journalHref(shiftDay(day, -1))),
        ArrowRight: () => navigate(journalHref(shiftDay(day, 1))),
        ArrowUp: () => navigate(journalHref(shiftDay(day, -7))),
        ArrowDown: () => navigate(journalHref(shiftDay(day, 7))),
        t: () => navigate(journalHref()),
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
  }, [day, navigate]);

  return (
    <div className="journal-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Food & weight</div>
          <h1>Journal</h1>
          <p>Log meals, record weight, and review a day.</p>
        </div>
      </header>
      <section
        className="journal-datebar"
        aria-label="Journal date and logging"
      >
        <div className="journal-date">
          <div className="day-arrows">
            <button
              className="step"
              aria-label="Previous day"
              onClick={() => choose(shiftDay(day, -1))}
            >
              <IconPrev aria-hidden />
            </button>
            <button
              className="step"
              aria-label="Next day"
              onClick={() => choose(shiftDay(day, 1))}
            >
              <IconNext aria-hidden />
            </button>
          </div>
          <button
            className="date-trigger"
            aria-label={"Choose journal date, " + fullDate}
            aria-haspopup="dialog"
            onClick={() => setCalendar(true)}
          >
            <IconLedger size={18} aria-hidden />
            <span>
              <strong>{relativeDay(day, today)}</strong>
              <time dateTime={day}>{fullDate}</time>
            </span>
          </button>
          {day !== today && (
            <a className="today-action" href={journalHref()}>
              Today
            </a>
          )}
        </div>
        <div className="journal-actions">
          <button
            className="secondary"
            onClick={() => setEntry({ kind: "weight" })}
          >
            <IconWeight size={16} aria-hidden />
            Log weight
          </button>
          <button
            className="primary"
            onClick={() => setEntry({ kind: "food" })}
          >
            <IconAdd size={16} aria-hidden />
            Log food<kbd aria-hidden>F</kbd>
          </button>
        </div>
      </section>
      {day !== today && (
        <p className="date-context">
          You’re viewing {fullDate}. New food and weight entries will be logged
          to this date.
        </p>
      )}
      {journal.error ? (
        <div className="errorcard" role="alert">
          <h2>This day couldn’t be loaded.</h2>
          <pre>{journal.error}</pre>
          <button className="secondary" onClick={journal.retry}>
            Try again
          </button>
        </div>
      ) : journal.view ? (
        <JournalEntries
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
        <div
          className="journal-loading"
          role="status"
          aria-label="Loading journal"
        >
          <i />
          <i />
        </div>
      )}
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
              day={day}
              isToday={day === today}
              source={entry.source}
              run={run}
              onClose={() => setEntry(null)}
              onLogged={(name) => {
                setEntry(null);
                void onChanged("Logged " + name + " · " + fullDate);
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
