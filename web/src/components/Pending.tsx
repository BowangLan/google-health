import { useState } from "react";
import type { Overview } from "../lib/types";

/**
 * Everything unsent, in one place. Push is explicit and never automatic: it
 * acts on a whole collection, so the list above the button is the point.
 */
export function PendingPopover({ overview, onRun, onClose }: {
  overview: Overview;
  onRun: (collection: "all" | "food" | "weight", command: string, values: Record<string, string | boolean>) => Promise<{ ok: boolean; text: string }>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  let pushable = 0;
  let blocked = false;
  const blocks: React.ReactNode[] = [];
  const groups: React.ReactNode[] = [];

  for (const collection of overview.collections) {
    const name = collection.kind === "food" ? "Food" : "Weight";
    if (collection.error) {
      blocked = true;
      blocks.push(
        <div key={`${name}-error`}>
          <h3>{name}</h3>
          <div className="line">{collection.error}</div>
        </div>,
      );
      continue;
    }

    pushable += collection.new + collection.edited + collection.deleted;

    if (collection.pending > 0) {
      blocked = true;
      blocks.push(
        <div key={`${name}-recovery`}>
          <h3>{name} · recovery</h3>
          <div className="line">
            A record may exist in Google Health without a saved ID. Pull before adding it again.
          </div>
          <button className="secondary" type="button" disabled={busy !== null}
            onClick={async () => { setBusy("pull"); await onRun(collection.kind, "pull", { days: "7", limit: "500" }); setBusy(null); }}>
            Pull now
          </button>
        </div>,
      );
    }
    if (collection.awaiting > 0) {
      blocked = true;
      blocks.push(
        <div key={`${name}-awaiting`}>
          <div className="line">{collection.awaiting} awaiting pull</div>
          <button className="secondary" type="button" disabled={busy !== null}
            onClick={async () => { setBusy("pull"); await onRun(collection.kind, "pull", { days: "7", limit: "500" }); setBusy(null); }}>
            Pull 7 days
          </button>
        </div>,
      );
    }
    if (collection.details.broken.length > 0) {
      blocked = true;
      blocks.push(
        <div key={`${name}-broken`}>
          <h3>{name} · unreadable</h3>
          {collection.details.broken.map((item) => <div className="line" key={item}>{item}</div>)}
        </div>,
      );
    }

    const counts = [
      collection.new && `${collection.new} new`,
      collection.edited && `${collection.edited} edited`,
      collection.deleted && `${collection.deleted} to delete`,
    ].filter(Boolean) as string[];

    if (counts.length > 0) {
      groups.push(
        <div key={name}>
          <h3>{name}</h3>
          <div className="line">{counts.join(" · ")}</div>
          {(["new", "edited", "deleted"] as const).flatMap((key) =>
            collection.details[key].map((item) => (
              <div className="line" key={`${key}-${item}`}>
                <span>{item}</span><span>{key}</span>
              </div>
            )),
          )}
        </div>,
      );
    }
  }

  const clean = blocks.length === 0 && groups.length === 0;

  return (
    <div className="popover">
      {blocks}
      {groups}
      {clean && <div className="line">Everything is in sync.</div>}
      <hr />
      <button className="secondary" type="button" disabled={busy !== null}
        onClick={async () => { setBusy("sync"); await onRun("all", "sync", { limit: "500" }); setBusy(null); }}>
        {busy === "sync" ? "Comparing…" : "Compare with Google"}
      </button>
      {pushable > 0 && (
        <>
          <button className="primary" type="button" disabled={blocked || busy !== null}
            onClick={async () => {
              setBusy("push");
              // -y because the subprocess has no terminal to answer the prompt.
              const outcome = await onRun("all", "push", { yes: true, limit: "500" });
              setBusy(null);
              if (outcome.ok) onClose();
            }}>
            {busy === "push" ? "Pushing…" : `Push ${pushable} change${pushable === 1 ? "" : "s"}`}
          </button>
          <div className="line">
            {blocked ? "Resolve the items above first." : "Food and weight push separately."}
          </div>
        </>
      )}
    </div>
  );
}

export function PendingPill({ overview, onClick, expanded }: {
  overview: Overview | null;
  onClick: () => void;
  expanded: boolean;
}) {
  if (!overview) return <button className="pill clean" type="button">…</button>;

  const attention = overview.collections.reduce((sum, c) =>
    sum + (c.error ? 1 : c.awaiting + c.pending + c.details.broken.length), 0);
  const work = overview.collections.reduce((sum, c) =>
    sum + (c.error ? 0 : c.new + c.edited + c.deleted), 0);

  const [className, label] = attention > 0
    ? ["pill warn", `${attention} needs attention`]
    : work > 0
      ? ["pill work", `${work} to push`]
      : ["pill clean", "Synced"];

  return (
    <button className={className} type="button" onClick={onClick} aria-expanded={expanded}>
      <span className="dot" />{label}
    </button>
  );
}
