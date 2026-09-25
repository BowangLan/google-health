import type { LogEntry } from "../lib/types";

export function ActivityStrip({ log, open, setOpen, busy }: {
  log: LogEntry[];
  open: boolean;
  setOpen: (open: boolean) => void;
  busy: boolean;
}) {
  const latest = log[0];
  const status = busy ? "busy" : !latest ? "" : latest.error || latest.code !== 0 ? "bad" : "ok";

  return (
    <footer className="activity">
      <button className="activity-bar" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`dot ${status}`} />
        <code>{busy ? "running…" : latest?.command ?? "No commands run yet"}</code>
        <span className="activity-hint">Activity</span>
      </button>
      {open && (
        <div className="activity-log">
          {log.length === 0 && <div className="note">Nothing has run yet.</div>}
          {log.map((entry) => (
            <div className="log-entry" key={entry.id}>
              <div className="log-head">
                <code>{entry.command}</code>
                <span className={`badge ${entry.error || entry.code !== 0 ? "bad" : "ok"}`}>
                  {entry.error ? "error" : entry.code === 0 ? "ok" : `exit ${entry.code}`}
                </span>
                <span className="stamp">
                  {entry.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              {entry.error && <pre className="err">{entry.error}</pre>}
              {entry.stdout && <pre>{entry.stdout.replace(/\n+$/, "")}</pre>}
              {entry.stderr && <pre className="err">{entry.stderr.replace(/\n+$/, "")}</pre>}
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}
