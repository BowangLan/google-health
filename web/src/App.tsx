import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../src/lib/api";
import { lastLine, shiftDay } from "./lib/format";
import { useActivity } from "./hooks/useActivity";
import { useHealth } from "./hooks/useHealth";
import { Calendar } from "./components/Calendar";
import { DayRail } from "./components/DayRail";
import { Composer } from "./components/Composer";
import { PendingPill, PendingPopover } from "./components/Pending";
import { SettingsPopover } from "./components/Settings";
import { Trends } from "./components/Trends";
import { ActivityStrip } from "./components/ActivityStrip";
import { ShortcutSheet } from "./components/Shortcuts";
import type { FoodRow, Kind } from "./lib/types";
import { IconContext } from "@phosphor-icons/react";
import { IconAdd, IconNext, IconPrev, IconSettings } from "./lib/icons";

type Panel = "pending" | "settings" | null;

export default function App() {
  const health = useHealth();
  const activity = useActivity();
  const [panel, setPanel] = useState<Panel>(null);
  const [composing, setComposing] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [tombstones, setTombstones] = useState<Record<string, string[]>>({});
  const railRef = useRef<HTMLDivElement>(null);

  const { monthView, dayView, overview, targets, selected } = health;

  /** Every CLI invocation: logged, toasted on failure, never silent. */
  const run = useCallback(async (
    collection: Kind | "all", command: string, values: Record<string, string | boolean>,
  ) => {
    activity.setBusy(true);
    try {
      const result = await api.runCommand(collection, command, values);
      activity.record(result);
      const ok = result.code === 0;
      if (!ok) activity.notify(lastLine(result.stdout, result.stderr) || `exit ${result.code}`, true);
      return { ok, text: lastLine(result.stdout, result.stderr) };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      activity.record({ code: null, stdout: "", stderr: "", command: `${collection} ${command}`, error: message });
      activity.notify(message, true);
      return { ok: false, text: message };
    } finally {
      activity.setBusy(false);
    }
  }, [activity]);

  const afterWrite = useCallback(async (message: string) => {
    await health.refresh();
    activity.notify(message);
  }, [activity, health]);

  const logAgain = useCallback(async (row: FoodRow) => {
    // clone addresses its source by position within a keyword search, so the
    // position is resolved immediately before using it.
    try {
      const found = await api.searchFoods(row.name);
      const match = found.matches.find((candidate) => candidate.name === row.name);
      if (!match) return activity.notify("that food is no longer in the local files", true);
      const outcome = await run("food", "clone", {
        keyword: row.name, index: String(match.index), amount: String(row.amount),
      });
      if (outcome.ok) await afterWrite(`Logged ${row.name}`);
    } catch (cause) {
      activity.notify(cause instanceof Error ? cause.message : String(cause), true);
    }
  }, [activity, afterWrite, run]);

  const onRecordChanged = useCallback(async (message: string, staged?: boolean) => {
    if (staged && selected) {
      setTombstones((current) => ({
        ...current,
        [selected]: [...(current[selected] ?? []), message.split("“")[1]?.split("”")[0] ?? "record"],
      }));
    }
    await afterWrite(message);
  }, [afterWrite, selected]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

      if (event.key === "Escape") {
        if (shortcuts) return setShortcuts(false);
        if (composing) return setComposing(false);
        return setPanel(null);
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.shiftKey) {
        if (event.key === "?") { event.preventDefault(); setShortcuts(true); }
        return;
      }
      if (!selected || !monthView) return;

      const actions: Record<string, () => void> = {
        ArrowLeft: () => health.select(shiftDay(selected, -1)),
        ArrowRight: () => health.select(shiftDay(selected, 1)),
        ArrowUp: () => health.select(shiftDay(selected, -7)),
        ArrowDown: () => health.select(shiftDay(selected, 7)),
        "[": () => health.stepMonth(-1),
        "]": () => health.stepMonth(1),
        t: () => health.select(monthView.today),
        f: () => setComposing(true),
        "/": () => setComposing(true),
        w: () => railRef.current?.querySelector<HTMLButtonElement>(".ghost-row")?.click(),
        p: () => setPanel((current) => (current === "pending" ? null : "pending")),
        "?": () => setShortcuts(true),
      };
      const action = actions[event.key];
      if (action) { event.preventDefault(); action(); return; }

      if (/^[1-5]$/.test(event.key) && dayView) {
        const chip = [...dayView.food].reverse()[Number(event.key) - 1];
        if (chip) { event.preventDefault(); void logAgain(chip); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composing, dayView, health, logAgain, monthView, selected, shortcuts]);

  if (health.error) {
    return (
      <div className="errorcard" style={{ margin: 24 }}>
        <div>Could not reach the server.</div>
        <pre>{health.error}</pre>
      </div>
    );
  }
  if (!monthView || !selected) return <div className="note">Loading…</div>;

  return (
    <IconContext.Provider value={{ size: 16, weight: "regular" }}>
      <header className="header">
        <span className="wordmark">Health</span>

        <div className="monthnav">
          <button className="step" type="button" aria-label="Previous month" title="Previous month"
            onClick={() => health.stepMonth(-1)}>
            <IconPrev aria-hidden focusable="false" />
          </button>
          <h1>{monthView.label}</h1>
          <button className="step" type="button" aria-label="Next month" title="Next month"
            onClick={() => health.stepMonth(1)}>
            <IconNext aria-hidden focusable="false" />
          </button>
        </div>

        <div className="header-right">
          <button className="secondary compact" type="button" onClick={() => setComposing(true)}>
            <IconAdd aria-hidden focusable="false" />Log food
          </button>
          <PendingPill
            overview={overview}
            expanded={panel === "pending"}
            onClick={() => setPanel(panel === "pending" ? null : "pending")}
          />
          <button className="step" type="button" aria-label="Settings" title="Settings"
            onClick={() => setPanel(panel === "settings" ? null : "settings")}>
            <IconSettings aria-hidden focusable="false" />
          </button>
        </div>
      </header>

      <main className="dash">
        <section className="analysis">
          <Trends unit={monthView.weight_unit} selected={selected} onSelect={health.select} />
        </section>

        <section className="side" ref={railRef}>
          <Calendar
            view={monthView}
            selected={selected}
            targets={targets}
            onSelect={health.select}
            compact
          />
          {dayView && (
            <DayRail
              view={dayView}
              targets={targets}
              tombstones={tombstones[selected] ?? []}
              loading={health.loadingDay}
              onAddFood={() => setComposing(true)}
              onAgain={logAgain}
              onChanged={onRecordChanged}
              onPendingClick={() => setPanel("pending")}
              run={run as never}
            />
          )}
        </section>
      </main>

      {composing && dayView && (
        <div className="composer-host">
          <Composer
            day={selected}
            isToday={selected === monthView.today}
            onClose={() => setComposing(false)}
            onLogged={async (name) => { setComposing(false); await afterWrite(`Logged ${name}`); }}
            run={run as never}
          />
        </div>
      )}

      {panel === "pending" && overview && (
        <PendingPopover
          overview={overview}
          onClose={() => setPanel(null)}
          onRun={async (collection, command, values) => {
            const outcome = await run(collection, command, values);
            activity.setOpen(true);
            await health.refresh();
            if (outcome.ok && command === "push") setTombstones({});
            return outcome;
          }}
        />
      )}

      {panel === "settings" && (
        <SettingsPopover
          overview={overview}
          targets={targets}
          onSaved={(saved) => {
            health.setTargets(saved);
            setPanel(null);
            void health.refresh();
            activity.notify("Settings saved");
          }}
        />
      )}

      {shortcuts && <ShortcutSheet onClose={() => setShortcuts(false)} />}

      {activity.toast && (
        <div className={`toast${activity.toast.bad ? " bad" : ""}`}>
          <span>{activity.toast.message}</span>
          <button type="button" onClick={activity.dismiss}>Dismiss</button>
        </div>
      )}

      <ActivityStrip log={activity.log} open={activity.open} setOpen={activity.setOpen} busy={activity.busy} />
    </IconContext.Provider>
  );
}
