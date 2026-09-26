import type { LogEntry } from "../lib/types";

export function ActivityPanel({
  log,
  busy,
}: {
  log: LogEntry[];
  busy: boolean;
}) {
  return (
    <div className="activity-panel">
      {busy && <p role="status">An operation is running…</p>}
      {log.length === 0 && (
        <div className="note">No activity in this session yet.</div>
      )}
      {log.map((entry) => (
        <div className="log-entry" key={entry.id}>
          <div className="log-head">
            <code>{entry.command}</code>
            <span
              className={
                entry.error || entry.code !== 0 ? "badge bad" : "badge ok"
              }
            >
              {entry.error
                ? "error"
                : entry.code === 0
                  ? "ok"
                  : "exit " + entry.code}
            </span>
            <time className="stamp">
              {entry.at.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          {entry.error && <pre className="err">{entry.error}</pre>}
          {entry.stdout && <pre>{entry.stdout.trimEnd()}</pre>}
          {entry.stderr && <pre className="err">{entry.stderr.trimEnd()}</pre>}
        </div>
      ))}
    </div>
  );
}
