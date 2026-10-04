import type { SyncFailure, SyncRun, SyncTrigger } from "../hooks/useSync";
import type { Toast } from "../hooks/useActivity";
import type { Overview } from "../lib/types";
import { IconSync, IconWarning } from "../lib/icons";
import { attentionItems, describeSync, useNow } from "./Sync";

/**
 * The app's one status surface, modelled on the iPhone's Dynamic Island: a
 * black capsule at the top centre. At rest it shows Google Health sync in two
 * compact slots, like a Live Activity. A notice grows it downward into a card
 * for a few seconds. Clicking it opens the sync sheet, which grows out of the
 * same spot.
 */
export function Island({
  overview,
  last,
  failure,
  running,
  busy,
  toast,
  expanded,
  onOpen,
  onDismiss,
}: {
  overview: Overview | null;
  last: SyncRun | null;
  failure: SyncFailure | null;
  running: SyncTrigger | null;
  /** A CLI command other than sync is running. */
  busy: boolean;
  toast: Toast | null;
  expanded: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const now = useNow();
  const attention = attentionItems(overview, last).length;
  const summary = describeSync({ overview, last, failure, running, attention, now });
  const line = summary.brief ? `${summary.label} · ${summary.brief}` : summary.label;
  const working = Boolean(running) || busy;
  const mode = toast ? "notice" : working ? "working" : "rest";
  return (
    <div
      className={`island ${mode} ${summary.tone}${toast?.bad ? " bad" : ""}`}
    >
      <button
        className="island-pill"
        type="button"
        onClick={onOpen}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={"Google Health sync, " + line}
      >
        <span className="island-lead" aria-hidden>
          {summary.tone === "warn" ? (
            <IconWarning size={15} />
          ) : (
            <IconSync size={15} className={working ? "spin" : undefined} />
          )}
        </span>
        <span className="island-label" aria-hidden>
          {busy && !running ? "Running" : summary.label}
        </span>
        <span className="island-trail" aria-hidden>
          {working ? <i className="island-wave" /> : summary.brief}
        </span>
      </button>
      <div className="island-notice">
        <div className="island-notice-inner">
          {toast && (
            <div role={toast.bad ? "alert" : "status"} className="island-message">
              <span>{toast.message}</span>
              <button type="button" onClick={onDismiss}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
