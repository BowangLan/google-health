import { cn } from "@/lib/utils";
import { Button } from "@/components/button";
import { useState } from "react";
import type { SyncFailure, SyncRun, SyncTrigger } from "@/features/sync/hooks/use-sync";
import { useNow } from "@/features/sync/hooks/use-now";
import { attentionItems, changes, count, describeSync, label, localCounts, when } from "@/features/sync/lib/status";
import { IconSync } from "@/lib/icons";
import type { Overview, SyncDiff, SyncOptions, SyncRow } from "@/lib/types";

/* ---------- panel ---------- */

function Diffs({ diff }: { diff: SyncDiff[] }) {
  return (
    <>
      {diff.map((d) => (
        <span className="sync-diff [font:11px/1.5_var(--mono)] text-muted-foreground wrap-anywhere" key={d.field}>
          {d.field}: {d.local} here, {d.remote} in Google Health
        </span>
      ))}
    </>
  );
}

function IncomingRow({ row }: { row: SyncRow }) {
  return (
    <li>
      <span className={cn(
        "sync-tag justify-self-start rounded-full py-0 px-2 [background:rgb(255_255_255_/_0.08)] text-muted-foreground",
        "text-[10.5px] font-[590] leading-[18px] whitespace-nowrap [&.warn]:bg-warning-muted [&.warn]:text-warning",
        "[&.bad]:[background:rgb(255_105_97_/_0.14)] [&.bad]:text-destructive"
      )}>{label(row.tag)}</span>
      <div className="sync-row-body grid gap-[3px] min-w-0">
        <span className="sync-row-text text-foreground wrap-anywhere [&_time]:mr-[7px] [&_time]:text-subtle">
          {row.time ? (
            <>
              <time dateTime={row.time}>{when(row.time)}</time>
              {row.detail}
            </>
          ) : row.path ? (
            <>
              {row.path}
              {row.detail && `: ${row.detail}`}
            </>
          ) : (
            row.text
          )}
        </span>
        <Diffs diff={row.diff} />
      </div>
    </li>
  );
}

const SHOWN = 8;

export function SyncPanel({
  overview,
  last,
  failure,
  running,
  onSync,
}: {
  overview: Overview | null;
  last: SyncRun | null;
  failure: SyncFailure | null;
  running: SyncTrigger | null;
  onSync: (options: SyncOptions) => Promise<unknown>;
}) {
  const now = useNow();
  const [alsoDelete, setAlsoDelete] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const busy = running !== null;
  const local = localCounts(overview);
  const attention = attentionItems(overview, last);
  const summary = describeSync({ overview, last, failure, running, attention: attention.length, now });
  const collections = overview?.collections.filter((c) => !c.error) ?? [];

  const runs = last?.result.collections ?? [];
  const incoming = runs.flatMap((c) => c.incoming);
  const kept = runs.flatMap((c) => c.events.filter((r) => r.phase === "pull" && r.tag === "held"));
  const made = last ? changes(last.result) : null;
  const deletionsHeld = runs.some((c) => c.deletions_held);

  const waiting = local.pushable + local.deletions;
  const deleting = alsoDelete && local.deletions > 0;
  const pushLabel =
    local.pushable > 0 && deleting
      ? `Push ${local.pushable} and delete ${local.deletions}`
      : local.pushable > 0
        ? `Push ${count(local.pushable, "change")}`
        : deleting
          ? `Delete ${local.deletions} from Google Health`
          : "Push";
  const canPush = !busy && local.blocked === 0 && (local.pushable > 0 || deleting);

  return (
    <div className="sync-panel grid">
      <header className={"sync-head flex justify-between items-start gap-4 py-5 px-5.5 border-b [border-bottom-style:solid] border-b-border [&_strong]:block [&_strong]:[font:650_20px/1.2_var(--display)] [&_strong]:tracking-[-0.02em] [&_strong_span]:text-subtle [&_strong_span]:font-normal [&_strong_span]:text-[15px] [&.warn_strong]:text-warning [&_p]:mt-1.5 [&_p]:text-muted-foreground [&_p]:text-[12.5px] [&_p]:max-w-[46ch] [&_p]:wrap-anywhere [&_.secondary]:shrink-0 " + summary.tone}>
        <div>
          <strong>
            {summary.label}
            {summary.brief && <span> · {summary.brief}</span>}
          </strong>
          <p>{summary.detail}</p>
        </div>
        <Button
          variant="secondary"
          type="button"
          disabled={busy}
          onClick={() => void onSync({ pull: true })}
        >
          <IconSync size={14} aria-hidden className={busy ? "spin animate-[spin_900ms_linear_infinite]" : undefined} />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </header>

      {attention.length > 0 && (
        <section className={cn(
          "sync-section grid gap-3 py-4.5 px-5.5 border-b [border-bottom-style:solid] border-b-border [&_h3]:flex [&_h3]:items-baseline",
          "[&_h3]:gap-2 [&_h3]:text-[13px] [&_h3_span]:text-subtle [&_h3_span]:font-normal [&_h3_span]:text-[11.5px]",
          "[&_.text-action]:justify-self-start"
        )} aria-label="Needs attention">
          <h3>
            Needs attention <span>{attention.length}</span>
          </h3>
          <ul className="sync-rows list-none m-0 p-0 grid gap-2 [&_li]:grid [&_li]:grid-cols-[84px_minmax(0,_1fr)] [&_li]:gap-2.5 [&_li]:items-baseline [&_li]:text-[12px]">
            {attention.map((item) => (
              <li key={item.key}>
                <span className={cn(
                  "sync-tag justify-self-start rounded-full py-0 px-2 [background:rgb(255_255_255_/_0.08)] text-muted-foreground",
                  "text-[10.5px] font-[590] leading-[18px] whitespace-nowrap [&.warn]:bg-warning-muted [&.warn]:text-warning",
                  "[&.bad]:[background:rgb(255_105_97_/_0.14)] [&.bad]:text-destructive warn"
                )}>{item.label}</span>
                <div className="sync-row-body grid gap-[3px] min-w-0">
                  <span className="sync-row-text text-foreground wrap-anywhere [&_time]:mr-[7px] [&_time]:text-subtle">{item.text}</span>
                  <Diffs diff={item.diff} />
                  {item.advice && <span className="sync-advice text-subtle text-[11.5px] leading-[1.5]">{item.advice}</span>}
                </div>
              </li>
            ))}
          </ul>
          {attention.some((item) => item.pull) && (
            <div className="sync-actions flex items-center flex-wrap gap-3 pt-0.5">
              <Button variant="secondary" type="button" disabled={busy} onClick={() => void onSync({ pull: true })}>
                Pull now
              </Button>
            </div>
          )}
        </section>
      )}

      <section className={cn(
        "sync-section grid gap-3 py-4.5 px-5.5 border-b [border-bottom-style:solid] border-b-border [&_h3]:flex [&_h3]:items-baseline",
        "[&_h3]:gap-2 [&_h3]:text-[13px] [&_h3_span]:text-subtle [&_h3_span]:font-normal [&_h3_span]:text-[11.5px]",
        "[&_.text-action]:justify-self-start"
      )} aria-label="To Google Health">
        <h3>
          To Google Health {waiting > 0 && <span>{waiting}</span>}
        </h3>
        {waiting === 0 ? (
          <p className="sync-empty text-subtle text-[12px] leading-[1.55] max-w-[52ch]">
            Nothing waiting. New entries are sent as you log them. Edits and
            deletions collect here until you push.
          </p>
        ) : (
          <>
            {collections.map((c) => {
              const rows: [string, string][] = [
                ...c.details.new.map((t): [string, string] => ["new", t]),
                ...c.details.edited.map((t): [string, string] => ["edited", t]),
                ...c.details.deleted.map((t): [string, string] => ["delete", t]),
              ];
              if (rows.length === 0) return null;
              const more = c.new + c.edited + c.deleted - rows.length;
              return (
                <div className="sync-group [&_h4]:mb-[7px] [&_h4]:text-subtle [&_h4]:text-[11px] [&_h4]:font-[560]" key={c.kind}>
                  <h4>{c.kind === "food" ? "Food" : "Weight"}</h4>
                  <ul className="sync-rows list-none m-0 p-0 grid gap-2 [&_li]:grid [&_li]:grid-cols-[84px_minmax(0,_1fr)] [&_li]:gap-2.5 [&_li]:items-baseline [&_li]:text-[12px]">
                    {rows.map(([tag, text], index) => (
                      <li key={`${tag}-${index}-${text}`}>
                        <span className={"sync-tag justify-self-start rounded-full py-0 px-2 [background:rgb(255_255_255_/_0.08)] text-muted-foreground text-[10.5px] font-[590] leading-[18px] whitespace-nowrap [&.warn]:bg-warning-muted [&.warn]:text-warning [&.bad]:[background:rgb(255_105_97_/_0.14)] [&.bad]:text-destructive" + (tag === "delete" ? " bad" : "")}>{tag}</span>
                        <span className="sync-row-text text-foreground wrap-anywhere [&_time]:mr-[7px] [&_time]:text-subtle">{text}</span>
                      </li>
                    ))}
                  </ul>
                  {more > 0 && <p className="sync-hint text-subtle text-[11.5px] leading-[1.5]">and {more} more</p>}
                </div>
              );
            })}
            {local.deletions > 0 && (
              <label className={cn(
                "sync-check flex items-center gap-2 text-muted-foreground text-[12px] [&_input]:w-[15px] [&_input]:h-[15px]",
                "[&_input]:min-h-0 [&_input]:m-0 [&_input]:[accent-color:var(--accent)]"
              )}>
                <input
                  type="checkbox"
                  checked={alsoDelete}
                  onChange={(event) => setAlsoDelete(event.target.checked)}
                />
                <span>Also delete {count(local.deletions, "record")} from Google Health</span>
              </label>
            )}
            {deletionsHeld && !alsoDelete && (
              <p className="sync-hint text-subtle text-[11.5px] leading-[1.5]">The last push left the deletions in place. Tick the box to confirm them.</p>
            )}
            <div className="sync-actions flex items-center flex-wrap gap-3 pt-0.5">
              <Button
                variant="primary"
                type="button"
                disabled={!canPush}
                onClick={() => void onSync({ pull: true, push: true, yes: deleting })}
              >
                {pushLabel}
              </Button>
              <span className="sync-hint text-subtle text-[11.5px] leading-[1.5]">
                {local.blocked > 0
                  ? "Resolve the items above first."
                  : "Pulls first, then sends. Conflicts are kept, never overwritten."}
              </span>
            </div>
          </>
        )}
      </section>

      {last && (incoming.length > 0 || kept.length > 0) && (
        <section className={cn(
          "sync-section grid gap-3 py-4.5 px-5.5 border-b [border-bottom-style:solid] border-b-border [&_h3]:flex [&_h3]:items-baseline",
          "[&_h3]:gap-2 [&_h3]:text-[13px] [&_h3_span]:text-subtle [&_h3_span]:font-normal [&_h3_span]:text-[11.5px]",
          "[&_.text-action]:justify-self-start"
        )} aria-label="From Google Health">
          <h3>
            From Google Health{" "}
            <span>
              {made && last.options.pull
                ? count(made.arrived + made.updated + made.removed, "record") + " pulled"
                : count(incoming.length, "record")}
            </span>
          </h3>
          <ul className="sync-rows list-none m-0 p-0 grid gap-2 [&_li]:grid [&_li]:grid-cols-[84px_minmax(0,_1fr)] [&_li]:gap-2.5 [&_li]:items-baseline [&_li]:text-[12px]">
            {(showAll ? incoming : incoming.slice(0, SHOWN)).map((row, index) => (
              <IncomingRow row={row} key={`${row.text}-${index}`} />
            ))}
          </ul>
          {incoming.length > SHOWN && !showAll && (
            <button className="text-action border-0 bg-none bg-transparent py-0.5 px-0 text-muted-foreground text-[12px] font-[590] pointer-hover:[&:hover]:text-foreground" type="button" onClick={() => setShowAll(true)}>
              Show all {incoming.length}
            </button>
          )}
          {kept.length > 0 && (
            <p className="sync-hint text-subtle text-[11.5px] leading-[1.5]">
              Kept your local version of {count(kept.length, "record")}:{" "}
              {kept.map((row) => row.path ?? row.text).join(", ")}
            </p>
          )}
        </section>
      )}

      {last && (
        <details className={cn(
          "sync-output [padding:12px_22px_20px] text-[12px] [&_summary]:text-subtle [&_code]:block",
          "[&_code]:[margin:10px_0_6px] [&_code]:[font:11px/1.5_var(--mono)] [&_code]:text-muted-foreground",
          "[&_code]:wrap-anywhere [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
          "[&_pre]:[font:11px/1.6_var(--mono)] [&_pre]:text-muted-foreground [&_pre.err]:text-destructive"
        )}>
          <summary>Command output</summary>
          <code>{last.result.command}</code>
          {last.result.stdout.trim() && <pre>{last.result.stdout.trim()}</pre>}
          {last.result.stderr.trim() && <pre className="err text-destructive">{last.result.stderr.trim()}</pre>}
        </details>
      )}
    </div>
  );
}
