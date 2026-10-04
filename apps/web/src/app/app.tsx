import { cn } from "@/lib/utils";
import { Button } from "@/components/button";
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { lastLine } from "@/lib/format";
import { dashboardHref } from "@/lib/navigation";
import { useActivity } from "@/features/activity/hooks/use-activity";
import { useHealth } from "@/hooks/use-health";
import { useRoute } from "@/hooks/use-route";
import { useSync, type SyncTrigger } from "@/features/sync/hooks/use-sync";
import { Dashboard } from "@/app/routes/dashboard";
import { Island } from "@/features/sync/components/island";
import { SyncPanel } from "@/features/sync/components/sync-panel";
import { changes } from "@/features/sync/lib/status";
import { SettingsPopover } from "@/features/settings/components/settings-popover";
import { ActivityPanel } from "@/features/activity/components/activity-panel";
import { Dialog } from "@/components/dialog";
import { ShortcutSheet } from "@/app/components/shortcut-sheet";
import type { RunCommand, SyncResult } from "@/lib/types";
import { IconContext } from "@phosphor-icons/react";
import {
  IconSettings,
  IconPulse,
  IconKeyboard,
  IconActivity,
} from "@/lib/icons";

type Panel = "sync" | "settings" | "activity" | "shortcuts" | null;

export function App() {
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
        made.arrived + made.updated + made.removed + made.sent + made.deleted + made.recovered;
      if (changed > 0) setRevision((current) => current + 1);
      if (trigger !== "auto" || made.arrived + made.updated + made.removed === 0) return;
      const records = (n: number) => (n === 1 ? "1 record" : n + " records");
      if (made.arrived + made.updated === 0) {
        activity.notify(records(made.removed) + " removed, deleted in Google Health");
        return;
      }
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
  }, []);

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
        className="skip-link fixed left-4 [top:-80px] z-[100] bg-primary text-primary-foreground py-2.5 px-4 rounded-full [&:focus]:top-3"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="app-shell min-h-dvh">
        <header className={cn(
          "topbar sticky top-0 z-[30] h-14 flex items-center justify-between py-0 px-5 [background:rgb(9_9_11_/_0.72)]",
          "[-webkit-backdrop-filter:blur(20px)_saturate(170%)] [backdrop-filter:blur(20px)_saturate(170%)]",
          "[&::after]:[content:''] [&::after]:absolute [&::after]:left-0 [&::after]:right-0 [&::after]:[top:100%]",
          "[&::after]:h-4.5 [&::after]:[background:linear-gradient(rgb(9_9_11_/_0.6),_transparent)]",
          "[&::after]:pointer-events-none max-[761px]:py-0 max-[761px]:px-3.5 max-[521px]:h-25 max-[521px]:items-start",
          "max-[521px]:pt-[11px] max-[521px]:[&::after]:h-3 reduced-transparency:bg-canvas",
          "reduced-transparency:[-webkit-backdrop-filter:none] reduced-transparency:[backdrop-filter:none]"
        )}>
          <a className="brand flex items-center gap-[9px] font-[650] text-[14px] tracking-[-0.01em]" href={dashboardHref(null, route.days)}>
            <span className={cn(
              "brand-symbol grid place-items-center w-6.5 h-6.5 rounded-[8px] text-white",
              "[background:linear-gradient(160deg,_#ff5a7a,_var(--energy)_55%,_#d81b4a)]",
              "shadow-[inset_0_1px_0_rgb(255_255_255_/_0.3)]"
            )}>
              <IconPulse size={17} aria-hidden />
            </span>
            <span className="wordmark">Health</span>
          </a>
          <Island
            overview={health.overview}
            last={sync.last}
            failure={sync.failure}
            running={sync.running}
            busy={activity.busy}
            toast={activity.toast}
            expanded={panel === "sync"}
            onOpen={() => setPanel("sync")}
            onDismiss={activity.dismiss}
          />
          <nav className="utilities flex gap-0.5" aria-label="Utilities">
            <Button
              variant="utility"
              aria-label="Activity"
              title="Activity"
              onClick={() => setPanel("activity")}
            >
              <IconActivity aria-hidden />
            </Button>
            <Button
              variant="utility"
              aria-label="Settings"
              title="Settings"
              onClick={() => setPanel("settings")}
            >
              <IconSettings aria-hidden />
            </Button>
            <Button
              variant="utility"
              aria-label="Shortcuts"
              title="Shortcuts (?)"
              onClick={() => setPanel("shortcuts")}
            >
              <IconKeyboard aria-hidden />
            </Button>
          </nav>
        </header>
        <main className="workspace max-w-[1480px] my-0 mx-[auto] [padding:30px_32px_72px] max-[761px]:[padding:24px_16px_56px] max-[381px]:pl-3 max-[381px]:pr-3" id="main" tabIndex={-1}>
          {health.error ? (
            <div className={cn(
              "startup-error [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
              "[&_pre]:[font:11.5px/1.6_var(--mono)] [&_pre]:text-muted-foreground grid gap-4 max-w-[520px] my-[12vh]",
              "mx-[auto] [&_h1]:[font:650_28px_var(--display)] [&_h1]:tracking-[-0.025em] [&_.primary]:justify-self-start"
            )}>
              <h1>Couldn’t connect</h1>
              <p>Check that the local Health server is running.</p>
              <pre>{health.error}</pre>
              <Button
                variant="primary"
                onClick={() => {
                  void health.refresh().catch(() => { });
                }}
              >
                Try again
              </Button>
            </div>
          ) : !health.today ? (
            <div className={cn(
              "day-loading grid gap-3 [&_i]:block [&_i]:h-30 [&_i]:rounded-[var(--r-tile)] [&_i]:bg-card [&_i]:border",
              "[&_i]:border-solid [&_i]:border-border [&_i]:animate-[breathe_1.6s_ease-in-out_infinite]",
              "[&_i:first-child]:h-57.5 [&_i:last-child]:h-70"
            )} role="status" aria-label="Loading Health">
              <i />
              <i />
              <i />
            </div>
          ) : (
            <Dashboard
              day={route.day ?? health.today}
              days={route.days}
              today={health.today}
              unit={health.weightUnit}
              targets={health.targets}
              revision={revision}
              navigate={navigate}
              run={run}
              onChanged={afterWrite}
              onSync={() => setPanel("sync")}
            />
          )}
        </main>
      </div>
      {panel === "sync" && (
        <Dialog
          title="Google Health"
          className="island-sheet [&_.dialog-heading]:[border-bottom-color:rgb(255_255_255_/_0.08)]"
          onClose={() => setPanel(null)}
        >
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
    </IconContext.Provider>
  );
}
