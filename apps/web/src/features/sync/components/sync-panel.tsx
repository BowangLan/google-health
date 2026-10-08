import { cn } from "@/design-system/lib/cn";
import { Button } from "@/design-system/primitives/button";
import { useState } from "react";
import type { SyncFailure, SyncRun, SyncTrigger } from "@/features/sync/hooks/use-sync";
import { useNow } from "@/features/sync/hooks/use-now";
import { attentionItems, changes, count, describeSync, label, localCounts, when } from "@/features/sync/lib/status";
import { IconSync } from "@/design-system/foundations/icons";
import type { Overview, SyncDiff, SyncOptions, SyncRow } from "@/lib/types";

/* ---------- panel ---------- */

function Diffs({ diff }: { diff: SyncDiff[] }) {
  return (
    <>
      {diff.map((d) => (
        <span className="sync-diff [font:11px/1.5_var(--ds-font-code)] text-muted-foreground wrap-anywhere" key={d.field}>
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
        "sync-tag mt-px justify-self-start rounded-capsule py-0 px-2 [background:var(--ds-color-control-hover)] text-muted-foreground",
        "text-[10.5px] font-control leading-[18px] whitespace-nowrap [&.warn]:bg-warning-muted [&.warn]:text-warning",
        "[&.bad]:[background:var(--ds-color-danger-hover)] [&.bad]:text-destructive"
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
    <div className="sync-panel grid [&_>_section:last-child]:border-b-0" aria-busy={busy}>
      <header className={"sync-head grid gap-5 py-6 px-6 max-[761px]:px-5 border-b border-solid border-border [&_strong]:block [&_strong]:[font:650_23px/1.2_var(--ds-font-display)] [&_strong]:tracking-[-0.02em] [&_strong_span]:text-subtle [&_strong_span]:font-normal [&_strong_span]:text-[14px] [&.warn_strong]:text-warning [&_p]:mt-2 [&_p]:text-muted-foreground [&_p]:text-ui-body [&_p]:leading-5 [&_p]:max-w-[46ch] [&_p]:wrap-anywhere " + summary.tone}>
        <div className="min-w-0" role="status" aria-live="polite" aria-atomic="true">
          <strong>
            {summary.label}
            {summary.brief && <span> · {summary.brief}</span>}
          </strong>
          <p>{summary.detail}</p>
        </div>
        <div className="grid gap-2.5">
          <Button
            variant="secondary"
            type="button"
            disabled={busy}
            className="min-h-11 w-full"
            onClick={() => void onSync({ pull: true })}
          >
            <IconSync size={14} aria-hidden className={busy ? "spin animate-[spin_900ms_linear_infinite]" : undefined} />
            {busy ? "Syncing…" : "Sync now"}
          </Button>
          <p className="!mt-0 text-center !text-ui-label">Checks Google Health and pulls updates into your journal.</p>
        </div>
      </header>

      {attention.length > 0 && (
        <section className={cn(
          "sync-section grid gap-4 py-5 px-6 max-[761px]:px-5 border-b border-solid border-border bg-warning-muted [&_h3]:flex [&_h3]:items-baseline",
          "[&_h3]:gap-2 [&_h3]:text-ui-subheading [&_h3_span]:text-subtle [&_h3_span]:font-normal [&_h3_span]:text-ui-label",
          "[&_.text-action]:justify-self-start"
        )} aria-label="Needs attention">
          <h3>
            Needs attention <span>{attention.length}</span>
          </h3>
          <ul className="sync-rows list-none m-0 p-0 grid gap-3 [&_li]:grid [&_li]:grid-cols-[92px_minmax(0,_1fr)] [&_li]:gap-2.5 [&_li]:items-start [&_li]:text-ui-label [&_li]:leading-[1.6]">
            {attention.map((item) => (
              <li key={item.key}>
                <span className={cn(
                  "sync-tag mt-px justify-self-start rounded-capsule py-0 px-2 [background:var(--ds-color-control-hover)] text-muted-foreground",
                  "text-[10.5px] font-control leading-[18px] whitespace-nowrap [&.warn]:bg-warning-muted [&.warn]:text-warning",
                  "[&.bad]:[background:var(--ds-color-danger-hover)] [&.bad]:text-destructive warn"
                )}>{item.label}</span>
                <div className="sync-row-body grid gap-[3px] min-w-0">
                  <span className="sync-row-text text-foreground wrap-anywhere [&_time]:mr-[7px] [&_time]:text-subtle">{item.text}</span>
                  <Diffs diff={item.diff} />
                  {item.advice && <span className="sync-advice text-subtle text-ui-detail leading-[1.5]">{item.advice}</span>}
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
        "sync-section grid gap-4 py-6 px-6 max-[761px]:px-5 border-b border-solid border-border [&_h3]:flex [&_h3]:items-baseline",
        "[&_h3]:gap-2 [&_h3]:text-ui-subheading [&_h3_span]:text-subtle [&_h3_span]:font-normal [&_h3_span]:text-ui-label",
        "[&_.text-action]:justify-self-start"
      )} aria-label="To Google Health">
        <div className="grid gap-1.5">
          <h3>Review changes {waiting > 0 && <span>{waiting}</span>}</h3>
          <p className="text-ui-label leading-5 text-muted-foreground">To Google Health. Local edits and deletions are sent only when you push.</p>
        </div>
        {waiting === 0 ? (
          <p className="sync-empty text-subtle text-ui-label leading-[1.55] max-w-[52ch]">
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
                <div className="sync-group [&_h4]:mb-[7px] [&_h4]:text-subtle [&_h4]:text-ui-caption [&_h4]:font-[560]" key={c.kind}>
                  <h4>{c.kind === "food" ? "Food" : "Weight"}</h4>
                  <ul className="sync-rows list-none m-0 p-0 grid gap-3 [&_li]:grid [&_li]:grid-cols-[92px_minmax(0,_1fr)] [&_li]:gap-2.5 [&_li]:items-start [&_li]:text-ui-label [&_li]:leading-[1.6]">
                    {rows.map(([tag, text], index) => (
                      <li key={`${tag}-${index}-${text}`}>
                        <span className={"sync-tag mt-px justify-self-start rounded-capsule py-0 px-2 [background:var(--ds-color-control-hover)] text-muted-foreground text-[10.5px] font-control leading-[18px] whitespace-nowrap [&.warn]:bg-warning-muted [&.warn]:text-warning [&.bad]:[background:var(--ds-color-danger-hover)] [&.bad]:text-destructive" + (tag === "delete" ? " bad" : "")}>{tag}</span>
                        <span className="sync-row-text text-foreground wrap-anywhere [&_time]:mr-[7px] [&_time]:text-subtle">{text}</span>
                      </li>
                    ))}
                  </ul>
                  {more > 0 && <p className="sync-hint text-subtle text-ui-detail leading-[1.5]">and {more} more</p>}
                </div>
              );
            })}
            {local.deletions > 0 && (
              <label className={cn(
                "sync-check flex items-start gap-2.5 [&_input]:mt-0.5 [&_input]:shrink-0 text-muted-foreground text-ui-label [&_input]:w-[15px] [&_input]:h-[15px]",
                "[&_input]:min-h-0 [&_input]:mx-0 [&_input]:mb-0 [&_input]:[accent-color:var(--ds-color-action)]"
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
              <p className="sync-hint text-subtle text-ui-detail leading-[1.5]">The last push left the deletions in place. Tick the box to confirm them.</p>
            )}
            <div className="sync-actions grid gap-2.5 pt-1">
              <Button
                variant="primary"
                type="button"
                disabled={!canPush}
                className="min-h-11 w-full"
                onClick={() => void onSync({ pull: true, push: true, yes: deleting })}
              >
                {pushLabel}
              </Button>
              <span className="sync-hint text-subtle text-ui-detail leading-[1.5]">
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
        "sync-section grid gap-4 py-5 px-6 max-[761px]:px-5 border-b border-solid border-border [&_h3]:flex [&_h3]:items-baseline",
          "[&_h3]:gap-2 [&_h3]:text-ui-subheading [&_h3_span]:text-subtle [&_h3_span]:font-normal [&_h3_span]:text-ui-label",
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
          <ul className="sync-rows list-none m-0 p-0 grid gap-3 [&_li]:grid [&_li]:grid-cols-[92px_minmax(0,_1fr)] [&_li]:gap-2.5 [&_li]:items-start [&_li]:text-ui-label [&_li]:leading-[1.6]">
            {(showAll ? incoming : incoming.slice(0, SHOWN)).map((row, index) => (
              <IncomingRow row={row} key={`${row.text}-${index}`} />
            ))}
          </ul>
          {incoming.length > SHOWN && !showAll && (
            <button className="text-action border-0 bg-none bg-transparent py-0.5 px-0 text-muted-foreground text-ui-label font-control pointer-hover:[&:hover]:text-foreground" type="button" onClick={() => setShowAll(true)}>
              Show all {incoming.length}
            </button>
          )}
          {kept.length > 0 && (
            <p className="sync-hint text-subtle text-ui-detail leading-[1.5]">
              Kept your local version of {count(kept.length, "record")}:{" "}
              {kept.map((row) => row.path ?? row.text).join(", ")}
            </p>
          )}
        </section>
      )}

      {last && (
        <details className={cn(
          "sync-output px-6 pt-3 pb-5 max-[761px]:px-5 text-ui-label [&_summary]:cursor-pointer [&_summary]:py-1 [&_summary]:text-subtle [&_code]:block",
          "[&_code]:[margin:10px_0_6px] [&_code]:[font:11px/1.5_var(--ds-font-code)] [&_code]:text-muted-foreground",
          "[&_code]:wrap-anywhere [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
          "[&_pre]:[font:11px/1.6_var(--ds-font-code)] [&_pre]:text-muted-foreground [&_pre.err]:text-destructive"
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
