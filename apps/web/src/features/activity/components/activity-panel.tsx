import type { LogEntry } from "@/lib/types";

function actionTitle(command: string) {
  if (/\bsync\b/.test(command)) return "Google Health sync";
  if (/\bfood\b.*\badd\b/.test(command)) return "Log food";
  if (/\bweight\b.*\badd\b/.test(command)) return "Log weight";
  if (/\bpull\b/.test(command)) return "Refresh from Google Health";
  if (/\bpush\b/.test(command)) return "Send changes to Google Health";
  if (/\bdelete\b/.test(command)) return "Delete record";
  if (/\bedit\b/.test(command)) return "Edit record";
  return "Health operation";
}

export function ActivityPanel({
  log,
  busy,
}: {
  log: LogEntry[];
  busy: boolean;
}) {
  return (
    <div className="activity-panel px-6 pt-5 pb-6 max-[761px]:px-5">
      <p className="pb-4 text-ui-body leading-5 text-muted-foreground">Recent operations in this session, newest first.</p>
      {busy && <p role="status" className="mb-4 rounded-notice bg-secondary p-3 text-ui-body">An operation is running…</p>}
      {log.length === 0 && (
        <div className="note grid gap-2 py-10 text-center">
          <p className="text-ui-subheading font-semibold">No activity in this session yet.</p>
          <p className="text-ui-body leading-5 text-muted-foreground">Food, weight and sync operations will appear here.</p>
        </div>
      )}
      {log.map((entry) => (
        <div className="log-entry border-b [border-bottom-style:solid] border-b-border py-4 px-0 last:border-b-0 [&_pre]:mt-2.5 [&_pre]:text-muted-foreground [&_pre.err]:text-destructive [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere [&_pre]:[font:11.5px/1.6_var(--ds-font-code)]" key={entry.id}>
          <div className="log-head grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5">
            <h3 className="text-[14px] font-semibold leading-5">{actionTitle(entry.command)}</h3>
            <time dateTime={entry.at.toISOString()} className="stamp text-subtle text-ui-label leading-5 whitespace-nowrap tabular-nums">
              {entry.at.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <span
              className={
                entry.error || entry.code !== 0 ? "badge justify-self-start text-muted-foreground [background:var(--ds-color-control-hover)] rounded-capsule py-0 px-[7px] text-[10.5px] leading-5 whitespace-nowrap [&.bad]:text-destructive bad" : "badge justify-self-start text-muted-foreground [background:var(--ds-color-control-hover)] rounded-capsule py-0 px-[7px] text-[10.5px] leading-5 whitespace-nowrap [&.bad]:text-destructive ok"
              }
            >
              {entry.error
                ? "Failed"
                : entry.code === 0
                  ? "Completed"
                  : entry.code === null ? "Did not complete" : "Failed · exit " + entry.code}
            </span>
          </div>
          {entry.error && <p className="mt-2 text-ui-body leading-5 text-destructive wrap-anywhere">{entry.error}</p>}
          <details className="mt-2 text-ui-label text-muted-foreground">
            <summary className="cursor-pointer py-1.5">Command details</summary>
            <code className="mt-2 block wrap-anywhere [font:11.5px/1.6_var(--ds-font-code)]">{entry.command}</code>
            {entry.stdout && <pre>{entry.stdout.trimEnd()}</pre>}
            {entry.stderr && <pre className="err text-destructive">{entry.stderr.trimEnd()}</pre>}
          </details>
        </div>
      ))}
    </div>
  );
}
