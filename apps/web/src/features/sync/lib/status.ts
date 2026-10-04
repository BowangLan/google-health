import type { SyncFailure, SyncRun, SyncTrigger } from "@/features/sync/hooks/use-sync";
import { parseDay } from "@/lib/format";
import type { Kind, Overview, SyncCollection, SyncDiff, SyncResult } from "@/lib/types";

/*
 * The sync surface reads two sources. The overview is the local truth: what
 * this machine has that Google Health does not yet know about, refreshed
 * after every write. The last run is what Google Health said the last time
 * we asked: what came in, what was kept, and what could not be reconciled.
 * Push is a button here, never a side effect of anything else.
 */

/* ---------- reading the state ---------- */

interface LocalCounts {
  /** New and edited records a push would send. */
  pushable: number;
  /** Local deletions a push would apply remotely once confirmed. */
  deletions: number;
  /** Conditions the CLI refuses to push past: recovery, orphans, unreadable files. */
  blocked: number;
}

export function localCounts(overview: Overview | null): LocalCounts {
  const counts = { pushable: 0, deletions: 0, blocked: 0 };
  for (const c of overview?.collections ?? []) {
    if (c.error) {
      counts.blocked += 1;
      continue;
    }
    counts.pushable += c.new + c.edited;
    counts.deletions += c.deleted;
    counts.blocked += c.pending + c.awaiting + c.details.broken.length;
  }
  return counts;
}

export interface AttentionItem {
  key: string;
  kind: Kind | null;
  label: string;
  text: string;
  diff: SyncDiff[];
  advice?: string;
  /** A pull is the documented next step. */
  pull?: boolean;
}

const ADVICE = {
  conf:
    "Changed both here and in Google Health, so sync keeps both. Edit the local file to match one side, then push. From a terminal, push --force keeps yours and pull --force keeps Google's.",
  missing:
    "Deleted in Google Health but edited here, so pull kept it. Delete the local file to accept the deletion, or remove its id line to push it as a new record.",
  recover:
    "A record may exist in Google Health without a saved id. Pull to match it before retrying.",
  broken: "Fix the file before syncing. An unreadable record blocks its whole collection.",
} as const;

const TAG_LABEL: Record<string, string> = {
  conf: "conflict",
  missing: "gone remotely",
  recover: "recovery",
  FAIL: "failed",
  part: "incomplete",
  bad: "unreadable",
  hold: "held",
  held: "kept",
  del: "delete",
  delete: "delete",
  edit: "edited",
  new: "new",
  refresh: "baseline",
  ok: "sent",
  adop: "recovered",
  keep: "kept",
};

export const label = (tag: string) => TAG_LABEL[tag] ?? tag;

/** Rows from a run that need a person, as opposed to rows that report work. */
const ATTENTION_TAGS = new Set(["conf", "missing", "FAIL", "part", "bad"]);

export function attentionItems(
  overview: Overview | null,
  last: SyncRun | null,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const seen = new Set<string>();
  const add = (item: AttentionItem) => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    items.push(item);
  };
  for (const c of overview?.collections ?? []) {
    if (c.error) {
      add({ key: `${c.kind}:error:${c.error}`, kind: c.kind, label: "error", text: c.error, diff: [] });
      continue;
    }
    for (const text of c.details.broken)
      add({ key: `${c.kind}:bad:${text}`, kind: c.kind, label: "unreadable", text, diff: [], advice: ADVICE.broken });
    for (const text of c.details.pending)
      add({ key: `${c.kind}:recover:${text}`, kind: c.kind, label: "recovery", text, diff: [], advice: ADVICE.recover, pull: true });
    for (const text of c.details.awaiting)
      add({ key: `${c.kind}:awaiting:${text}`, kind: c.kind, label: "awaiting pull", text, diff: [], advice: ADVICE.recover, pull: true });
  }
  for (const c of last?.result.collections ?? []) {
    for (const row of [...c.attention, ...c.events]) {
      if (!ATTENTION_TAGS.has(row.tag)) continue;
      add({
        key: `${c.kind}:${row.tag}:${row.text}`,
        kind: c.kind,
        label: label(row.tag),
        text: row.text,
        diff: row.diff,
        advice: row.tag === "conf" ? ADVICE.conf : row.tag === "missing" ? ADVICE.missing : undefined,
      });
    }
  }
  return items;
}

export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function relative(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 2) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 2) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  return "at " + new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** A record's own wall-clock time, as written in its file. */
export function when(iso: string): string {
  const day = parseDay(iso.slice(0, 10));
  const date = Number.isNaN(day.getTime())
    ? iso.slice(0, 10)
    : day.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date} ${iso.slice(11, 16)}`;
}

const sum = (collections: SyncCollection[], pick: (c: SyncCollection) => number) =>
  collections.reduce((total, c) => total + pick(c), 0);

export interface Changes {
  /** Records that did not exist here before the pull. */
  arrived: number;
  /** Local copies the pull refreshed from Google Health. */
  updated: number;
  /** Local copies the pull deleted because Google Health deleted them. */
  removed: number;
  /** Local edits and deletions the pull left alone. */
  held: number;
  sent: number;
  deleted: number;
  recovered: number;
  failed: number;
}

/**
 * What a run changed. The CLI's "saved" count is every record it rewrote,
 * unchanged ones included; the comparison rows are the actual difference, and
 * a pull applies every incoming row because dirty records are never incoming.
 */
export function changes(result: SyncResult): Changes {
  const cs = result.collections;
  const pulled = cs.filter((c) => c.ran.includes("pull") && c.pull);
  return {
    arrived: sum(pulled, (c) => c.incoming.filter((r) => r.tag === "new").length),
    updated: sum(pulled, (c) => c.incoming.filter((r) => r.tag !== "new" && r.tag !== "delete").length),
    removed: sum(pulled, (c) => c.pull?.removed ?? 0),
    held: sum(pulled, (c) => c.pull?.held ?? 0),
    sent: sum(cs, (c) => c.push?.saved ?? 0),
    deleted: sum(cs, (c) => c.push?.deleted ?? 0),
    recovered: sum(cs, (c) => c.push?.recovered ?? 0),
    failed: sum(cs, (c) => c.push?.failed ?? 0),
  };
}

/** One sentence on what the last run did. */
function outcome(run: SyncRun): string {
  const cs = run.result.collections;
  const made = changes(run.result);
  const parts: string[] = [];
  if (made.arrived && made.updated)
    parts.push(`pulled ${made.arrived} new and updated ${made.updated}`);
  else if (made.arrived) parts.push(`pulled ${count(made.arrived, "record")}`);
  else if (made.updated) parts.push(`updated ${count(made.updated, "record")} from Google Health`);
  if (made.removed) parts.push(`removed ${count(made.removed, "record")} deleted in Google Health`);
  if (made.held) parts.push(`kept ${count(made.held, "local change")}`);
  if (made.sent) parts.push(`sent ${count(made.sent, "record")}`);
  if (made.deleted) parts.push(`deleted ${made.deleted} in Google Health`);
  if (made.failed) parts.push(`held ${count(made.failed, "record")}`);
  if (parts.length === 0) {
    if (cs.some((c) => !c.checked)) return "Not every collection was checked.";
    const work = cs.some((c) => c.incoming.length + c.outgoing.length + c.attention.length > 0);
    return work ? "Nothing changed." : "Everything matches Google Health.";
  }
  const text = parts.join(", ");
  return text[0]!.toUpperCase() + text.slice(1) + ".";
}

function checkedRange(run: SyncRun): string {
  const since = run.result.collections
    .map((c) => c.since)
    .filter((s): s is string => Boolean(s))
    .sort()[0];
  if (!since) return "";
  const day = parseDay(since);
  return Number.isNaN(day.getTime())
    ? ""
    : ` Checked from ${day.toLocaleDateString([], { month: "short", day: "numeric" })}.`;
}

export interface SyncSummary {
  tone: "quiet" | "work" | "warn" | "busy";
  label: string;
  /** Short qualifier for the sidebar, usually a relative time. */
  brief: string;
  /** A sentence for the panel. */
  detail: string;
}

export function describeSync({
  overview,
  last,
  failure,
  running,
  attention,
  now,
}: {
  overview: Overview | null;
  last: SyncRun | null;
  failure: SyncFailure | null;
  running: SyncTrigger | null;
  attention: number;
  now: number;
}): SyncSummary {
  if (running) {
    return { tone: "busy", label: "Syncing…", brief: "", detail: "Comparing with Google Health." };
  }
  if (failure) {
    return { tone: "warn", label: "Sync failed", brief: relative(failure.at, now), detail: failure.message };
  }
  const checked = last ? `${outcome(last)}${checkedRange(last)}` : "";
  if (attention > 0) {
    return { tone: "warn", label: "Needs attention", brief: count(attention, "item"), detail: checked };
  }
  const local = localCounts(overview);
  const waiting = local.pushable + local.deletions;
  if (waiting > 0) {
    return {
      tone: "work",
      label: `${waiting} to push`,
      brief: last ? relative(last.at, now) : "",
      detail: checked || "Push when you are ready.",
    };
  }
  if (last) {
    return { tone: "quiet", label: "Synced", brief: relative(last.at, now), detail: checked };
  }
  return {
    tone: "quiet",
    label: overview ? "Not checked yet" : "…",
    brief: "",
    detail: "Use Sync now to check Google Health.",
  };
}
