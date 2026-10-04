import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import type { RunResult, SyncOptions, SyncResult } from "@/lib/types";

export type SyncTrigger = "auto" | "manual";

export interface SyncRun {
  result: SyncResult;
  /** When the run finished, in local milliseconds. */
  at: number;
  trigger: SyncTrigger;
  options: SyncOptions;
}

export interface SyncFailure {
  message: string;
  at: number;
}

/**
 * Coming back to the tab pulls from Google Health, so the journal shows what
 * the phone logged meanwhile. Two returns within this gap share one run.
 */
export const AUTO_GAP_MS = 45_000;

/** What an automatic sync does. Pull keeps local edits and deletions. */
export const AUTO_OPTIONS: SyncOptions = { pull: true };

/**
 * One sync at a time, automatically on focus, manually from the
 * panel. Push is never automatic: edits and deletions wait for a click.
 */
export function useSync({
  ready,
  record,
  onResult,
}: {
  /** The app has loaded; nothing runs before that. */
  ready: boolean;
  /** Lands the run in the Activity log like any other command. */
  record: (result: RunResult) => void;
  onResult: (result: SyncResult, trigger: SyncTrigger) => void;
}) {
  const [running, setRunning] = useState<SyncTrigger | null>(null);
  const [last, setLast] = useState<SyncRun | null>(null);
  const [failure, setFailure] = useState<SyncFailure | null>(null);
  const inflight = useRef<Promise<SyncResult | null> | null>(null);
  const startedAt = useRef(0);
  const callbacks = useRef({ record, onResult });
  callbacks.current = { record, onResult };

  const sync = useCallback(
    (options: SyncOptions, trigger: SyncTrigger = "manual") => {
      if (inflight.current) return inflight.current;
      startedAt.current = Date.now();
      setRunning(trigger);
      const promise = (async () => {
        try {
          const result = await api.runSync(options);
          callbacks.current.record(result);
          const at = Date.now();
          setLast({ result, at, trigger, options });
          setFailure(result.error ? { message: result.error, at } : null);
          callbacks.current.onResult(result, trigger);
          return result;
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          callbacks.current.record({
            code: null,
            stdout: "",
            stderr: "",
            command: "sync",
            error: message,
          });
          setFailure({ message, at: Date.now() });
          return null;
        } finally {
          inflight.current = null;
          setRunning(null);
        }
      })();
      inflight.current = promise;
      return promise;
    },
    [],
  );

  useEffect(() => {
    if (!ready) return;
    const auto = () => {
      if (document.visibilityState !== "visible") return;
      if (inflight.current) return;
      if (Date.now() - startedAt.current < AUTO_GAP_MS) return;
      void sync(AUTO_OPTIONS, "auto");
    };
    window.addEventListener("focus", auto);
    document.addEventListener("visibilitychange", auto);
    return () => {
      window.removeEventListener("focus", auto);
      document.removeEventListener("visibilitychange", auto);
    };
  }, [ready, sync]);

  return { running, last, failure, sync };
}
