import type { LogEntry } from "@/lib/types";

export function ActivityPanel({
  log,
  busy,
}: {
  log: LogEntry[];
  busy: boolean;
}) {
  return (
    <div className="activity-panel px-6 pt-1 pb-5.5 max-[761px]:px-5 [&_>_p]:py-3 [&_>_p]:text-[12px] [&_>_p]:text-muted-foreground">
      {busy && <p role="status">An operation is running…</p>}
      {log.length === 0 && (
        <div className="note py-8 text-center text-subtle text-[13px]">No activity in this session yet.</div>
      )}
      {log.map((entry) => (
        <div className="log-entry border-b [border-bottom-style:solid] border-b-border py-4 px-0 last:border-b-0 [&_pre]:mt-2.5 [&_pre]:text-muted-foreground [&_pre.err]:text-destructive [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere [&_pre]:[font:11.5px/1.6_var(--mono)]" key={entry.id}>
          <div className="log-head grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2.5 text-[11.5px] leading-[1.6] [&_code]:min-w-0 [&_code]:wrap-anywhere max-[421px]:[&_code]:col-span-3 [&_code]:[font-family:var(--mono)]">
            <code>{entry.command}</code>
            <span
              className={
                entry.error || entry.code !== 0 ? "badge text-muted-foreground [background:rgb(255_255_255_/_0.08)] rounded-full py-0 px-[7px] text-[10.5px] leading-5 whitespace-nowrap [&.bad]:text-destructive bad" : "badge text-muted-foreground [background:rgb(255_255_255_/_0.08)] rounded-full py-0 px-[7px] text-[10.5px] leading-5 whitespace-nowrap [&.bad]:text-destructive ok"
              }
            >
              {entry.error
                ? "error"
                : entry.code === 0
                  ? "ok"
                  : "exit " + entry.code}
            </span>
            <time className="stamp text-subtle text-[10.5px] leading-5 whitespace-nowrap tabular-nums max-[421px]:col-span-2 max-[421px]:justify-self-end">
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
