import { useCallback, useEffect, useState } from "react";
import * as api from "./lib/api";
import { lastLine } from "./lib/format";
import { journalHref, trendsHref } from "./lib/navigation";
import { useActivity } from "./hooks/useActivity";
import { useHealth } from "./hooks/useHealth";
import { useRoute } from "./hooks/useRoute";
import { useSync, type SyncTrigger } from "./hooks/useSync";
import { Journal } from "./components/Journal";
import { SyncPanel, SyncStatus, changes } from "./components/Sync";
import { SettingsPopover } from "./components/Settings";
import { Trends } from "./components/Trends";
import { ActivityPanel } from "./components/ActivityStrip";
import { Dialog } from "./components/Dialog";
import { ShortcutSheet } from "./components/Shortcuts";
import type { RunCommand, SyncResult } from "./lib/types";
import { IconContext } from "@phosphor-icons/react";
import {
  IconSettings,
  IconTrends,
  IconLedger,
  IconPulse,
  IconKeyboard,
  IconActivity,
} from "./lib/icons";

type Panel = "sync" | "settings" | "activity" | "shortcuts" | null;

export default function App() {
  const health = useHealth();
  const activity = useActivity();
  const { route, navigate } = useRoute();
  const [revision, setRevision] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);

  // A sync's response carries the overview, so the sidebar updates at once.
  // Only a run that changed records reloads the page underneath.
  const afterSync = useCallback(
    (result: SyncResult, trigger: SyncTrigger) => {
      health.setOverview(result.overview);
      const made = changes(result);
      const changed =
        made.arrived + made.updated + made.sent + made.deleted + made.recovered;
      if (changed > 0) setRevision((current) => current + 1);
      if (trigger !== "auto" || made.arrived + made.updated === 0) return;
      const records = (n: number) => (n === 1 ? "1 record" : n + " records");
      activity.notify(
        made.arrived && made.updated
          ? `${made.arrived} arrived, ${made.updated} updated from Google Health`
          : made.arrived
            ? records(made.arrived) + " arrived from Google Health"
            : records(made.updated) + " updated from Google Health",
      );
    },
    [health, activity],
  );
  const sync = useSync({
    ready: Boolean(health.today) && !health.error,
    record: activity.record,
    onResult: afterSync,
  });

  const run: RunCommand = useCallback(
    async (collection, command, values) => {
      activity.setBusy(true);
      try {
        const result = await api.runCommand(collection, command, values);
        activity.record(result);
        const ok = result.code === 0;
        const text = lastLine(result.stdout, result.stderr);
        if (!ok)
          activity.notify(
            text || "Operation failed. See Activity for details.",
            true,
          );
        return { ok, text };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        activity.record({
          code: null,
          stdout: "",
          stderr: "",
          command: collection + " " + command,
          error: message,
        });
        activity.notify(message, true);
        return { ok: false, text: message };
      } finally {
        activity.setBusy(false);
      }
    },
    [activity],
  );

  const afterWrite = useCallback(
    async (message: string) => {
      activity.notify(message);
      setRevision((current) => current + 1);
      try {
        await health.refresh();
      } catch {
        activity.notify(
          "Saved. Sync status couldn’t refresh; open Sync to check it.",
          true,
        );
      }
    },
    [health, activity],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        document.querySelector("dialog[open]") ||
        target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const actions: Record<string, () => void> = {
        j: () => navigate(journalHref()),
        g: () => navigate(trendsHref()),
        p: () => setPanel("sync"),
        "?": () => setPanel("shortcuts"),
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    setPanel(null);
    window.scrollTo({ top: 0 });
  }, [route.page]);

  useEffect(() => {
    const keyboard = () => {
      document.documentElement.dataset.input = "keyboard";
    };
    const pointer = () => {
      document.documentElement.dataset.input = "pointer";
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  return (
    <IconContext.Provider value={{ size: 18, weight: "regular" }}>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Health navigation">
          <a className="brand" href={journalHref()}>
            <span className="brand-symbol">
              <IconPulse size={22} aria-hidden />
            </span>
            <span className="wordmark">Health</span>
            <span className="local-label">Personal</span>
          </a>
          <nav className="main-nav" aria-label="Main">
            <a
              href={journalHref()}
              aria-current={route.page === "journal" ? "page" : undefined}
            >
              <IconLedger aria-hidden />
              Journal
            </a>
            <a
              href={trendsHref()}
              aria-current={route.page === "trends" ? "page" : undefined}
            >
              <IconTrends aria-hidden />
              Trends
            </a>
          </nav>
          <div className="sidebar-bottom">
            <button
              className="nav-utility"
              onClick={() => setPanel("activity")}
            >
              <IconActivity aria-hidden />
              Activity
              {activity.busy && (
                <span className="activity-running">Running</span>
              )}
            </button>
            <button
              className="nav-utility"
              onClick={() => setPanel("settings")}
            >
              <IconSettings aria-hidden />
              Settings
            </button>
            <button
              className="nav-utility"
              onClick={() => setPanel("shortcuts")}
            >
              <IconKeyboard aria-hidden />
              Shortcuts<kbd aria-hidden>?</kbd>
            </button>
            <SyncStatus
              overview={health.overview}
              last={sync.last}
              failure={sync.failure}
              running={sync.running}
              expanded={panel === "sync"}
              onClick={() => setPanel("sync")}
            />
          </div>
        </aside>
        <main className="workspace" id="main" tabIndex={-1}>
          {health.error ? (
            <div className="startup-error">
              <h1>Couldn’t connect</h1>
              <p>Check that the local Health server is running.</p>
              <pre>{health.error}</pre>
              <button
                className="primary"
                onClick={() => {
                  void health.refresh().catch(() => {});
                }}
              >
                Try again
              </button>
            </div>
          ) : !health.today ? (
            <div
              className="journal-loading"
              role="status"
              aria-label="Loading Health"
            >
              <i />
              <i />
            </div>
          ) : route.page === "journal" ? (
            <Journal
              key={route.day ?? health.today}
              day={route.day ?? health.today}
              today={health.today}
              unit={health.weightUnit}
              targets={health.targets}
              revision={revision}
              navigate={navigate}
              run={run}
              onChanged={afterWrite}
              onSync={() => setPanel("sync")}
            />
          ) : (
            <div className="trends-page">
              <header className="page-header">
                <div>
                  <div className="eyebrow">Long-term view</div>
                  <h1>Trends</h1>
                  <p>Understand your weight and nutrition over time.</p>
                </div>
              </header>
              <Trends
                unit={health.weightUnit}
                days={route.days}
                inspectedDay={route.day}
                navigate={navigate}
                revision={revision}
              />
            </div>
          )}
        </main>
      </div>
      {panel === "sync" && (
        <Dialog title="Google Health" onClose={() => setPanel(null)}>
          <SyncPanel
            overview={health.overview}
            last={sync.last}
            failure={sync.failure}
            running={sync.running}
            onSync={(options) => sync.sync(options, "manual")}
          />
        </Dialog>
      )}
      {panel === "settings" && (
        <Dialog title="Settings" onClose={() => setPanel(null)}>
          <SettingsPopover
            overview={health.overview}
            targets={health.targets}
            onSaved={(saved) => {
              health.setTargets(saved);
              setPanel(null);
              void afterWrite("Settings saved");
            }}
          />
        </Dialog>
      )}
      {panel === "activity" && (
        <Dialog title="Activity" onClose={() => setPanel(null)}>
          <ActivityPanel log={activity.log} busy={activity.busy} />
        </Dialog>
      )}
      {panel === "shortcuts" && (
        <ShortcutSheet onClose={() => setPanel(null)} />
      )}
      {activity.toast && (
        <div
          role={activity.toast.bad ? "alert" : "status"}
          className={"toast" + (activity.toast.bad ? " bad" : "")}
        >
          <span>{activity.toast.message}</span>
          <button onClick={activity.dismiss}>Dismiss</button>
        </div>
      )}
    </IconContext.Provider>
  );
}
