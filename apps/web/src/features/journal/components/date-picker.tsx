import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/forms/form-styles";
import { Button } from "@/components/button";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { parseDay, shiftMonth } from "@/lib/format";
import type { MonthView, Targets } from "@/lib/types";
import { validDay } from "@/lib/navigation";
import { Calendar } from "@/features/journal/components/calendar";
import { Dialog } from "@/components/dialog";
import { IconNext, IconPrev } from "@/lib/icons";

/** Browsing months does not change the dashboard. Only choosing a date does. */
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
      title="Choose a date"
      onClose={onClose}
      className="date-dialog"
    >
      <div className="date-picker [padding:20px_22px_22px] max-[761px]:p-4.5">
        <form
          className="date-jump grid grid-cols-[minmax(0,_1fr)_auto] items-end gap-2.5 mb-5.5"
          onSubmit={(event) => {
            event.preventDefault();
            const chosen = validDay(input);
            if (chosen) onPick(chosen);
          }}
        >
          <label className={fieldClassName}>
            <span>Go to date</span>
            <input
              type="date"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              required
            />
          </label>
          <Button variant="secondary" type="submit">
            Go
          </Button>
        </form>
        <div className="monthnav flex items-center gap-1 mb-3.5 [&_h3]:mr-auto [&_h3]:[font:650_17px_var(--display)] [&_h3]:tracking-[-0.015em]">
          <h3>
            {parseDay(month + "-01").toLocaleDateString([], {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <Button
            variant="step"
            aria-label="Previous month"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
          >
            <IconPrev aria-hidden />
          </Button>
          <Button
            variant="step"
            aria-label="Next month"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
          >
            <IconNext aria-hidden />
          </Button>
        </div>
        {error ? (
          <div className={cn(
            "errorcard border border-solid border-[rgb(245_184_92_/_0.3)] bg-warning-muted rounded-[var(--r-tile)] p-5.5",
            "grid gap-3.5 text-[13px] [&_h2]:text-[16px] [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
            "[&_pre]:[font:11.5px/1.6_var(--mono)] [&_pre]:text-muted-foreground [&_.secondary]:justify-self-start"
          )} role="alert">
            <p>Couldn’t load this month.</p>
            <Button
              variant="secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry month
            </Button>
          </div>
        ) : view?.month === month ? (
          <Calendar
            view={view}
            selected={day}
            targets={targets}
            onSelect={onPick}
          />
        ) : (
          <div className="calendar-placeholder min-h-[280px] py-10 px-0 text-subtle" role="status">
            Loading month…
          </div>
        )}
        <div className="calendar-foot flex items-center justify-between gap-3 border-t [border-top-style:solid] border-t-border mt-4 pt-3.5 text-subtle text-[11px]">
          <span>Calories logged on each day</span>
          <Button variant="secondary" onClick={() => onPick(today)}>
            Today
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
