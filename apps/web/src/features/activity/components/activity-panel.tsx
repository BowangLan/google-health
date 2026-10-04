import type { LogEntry } from "@/lib/types";

export function ActivityPanel({
  log,
  busy,
}: {
  log: LogEntry[];
  busy: boolean;
}) {
  return (
    <div className="activity-panel [padding:4px_22px_22px]">
      {busy && <p role="status">An operation is running…</p>}
      {log.length === 0 && (
        <div className="note p-5.5 text-subtle text-[13px]">No activity in this session yet.</div>
      )}
      {log.map((entry) => (
        <div className="log-entry border-b [border-bottom-style:solid] border-b-border py-3.5 px-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere [&_pre]:[font:11.5px/1.6_var(--mono)]" key={entry.id}>
          <div className="log-head flex items-center gap-2.5 text-[11.5px] [&_code]:wrap-anywhere [&_code]:[font-family:var(--mono)]">
            <code>{entry.command}</code>
            <span
              className={
                entry.error || entry.code !== 0 ? "badge text-muted-foreground [background:rgb(255_255_255_/_0.08)] rounded-full py-0 px-[7px] text-[10.5px] [&.bad]:text-destructive bad" : "badge text-muted-foreground [background:rgb(255_255_255_/_0.08)] rounded-full py-0 px-[7px] text-[10.5px] [&.bad]:text-destructive ok"
              }
            >
              {entry.error
                ? "error"
                : entry.code === 0
                  ? "ok"
                  : "exit " + entry.code}
            </span>
            <time className="stamp text-subtle ml-auto text-[10.5px] whitespace-nowrap">
              {entry.at.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          {entry.error && <pre className="err text-destructive">{entry.error}</pre>}
          {entry.stdout && <pre>{entry.stdout.trimEnd()}</pre>}
          {entry.stderr && <pre className="err text-destructive">{entry.stderr.trimEnd()}</pre>}
        </div>
      ))}
    </div>
  );
}
