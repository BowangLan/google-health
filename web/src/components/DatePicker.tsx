import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { parseDay, shiftMonth } from "../lib/format";
import type { MonthView, Targets } from "../lib/types";
import { validDay } from "../lib/navigation";
import { Calendar } from "./Calendar";
import { Dialog } from "./Dialog";
import { IconNext, IconPrev } from "../lib/icons";

/** Browsing months does not change the journal. Only choosing a date does. */
export function DatePicker({
  day,
  today,
  targets,
  onPick,
  onClose,
}: {
  day: string;
  today: string;
  targets: Targets;
  onPick: (day: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const [view, setView] = useState<MonthView | null>(null);
  const [input, setInput] = useState(day);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    api
      .getMonth(month)
      .then((data) => {
        if (live) setView(data);
      })
      .catch((cause) => {
        if (live) setError(String(cause));
      });
    return () => {
      live = false;
    };
  }, [month, attempt]);
  return (
    <Dialog
      title="Choose a journal date"
      onClose={onClose}
      className="date-dialog"
    >
      <div className="date-picker">
        <form
          className="date-jump"
          onSubmit={(event) => {
            event.preventDefault();
            const chosen = validDay(input);
            if (chosen) onPick(chosen);
          }}
        >
          <label className="field">
            <span>Go to date</span>
            <input
              type="date"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              required
            />
          </label>
          <button className="secondary" type="submit">
            Go
          </button>
        </form>
        <div className="monthnav">
          <h3>
            {parseDay(month + "-01").toLocaleDateString([], {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <button
            className="step"
            aria-label="Previous month"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
          >
            <IconPrev aria-hidden />
          </button>
          <button
            className="step"
            aria-label="Next month"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
          >
            <IconNext aria-hidden />
          </button>
        </div>
        {error ? (
          <div className="errorcard" role="alert">
            <p>Couldn’t load this month.</p>
            <button
              className="secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry month
            </button>
          </div>
        ) : view?.month === month ? (
          <Calendar
            view={view}
            selected={day}
            targets={targets}
            onSelect={onPick}
          />
        ) : (
          <div className="calendar-placeholder" role="status">
            Loading month…
          </div>
        )}
        <div className="calendar-foot">
          <span>Calories logged on each day</span>
          <button className="secondary" onClick={() => onPick(today)}>
            Today
          </button>
        </div>
      </div>
    </Dialog>
  );
}
