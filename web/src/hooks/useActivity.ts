import { useCallback, useRef, useState } from "react";
import type { LogEntry, RunResult } from "../lib/types";

export interface Toast {
  message: string;
  bad: boolean;
}

/**
 * The command log behind the footer strip, plus the toast. Every CLI
 * invocation lands here so the user can always read what actually ran.
 */
export function useActivity() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string, bad = false) => {
    setToast({ message, bad });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), bad ? 8000 : 3000);
  }, []);

  const record = useCallback((result: RunResult) => {
    const entry: LogEntry = {
      id: nextId.current++,
      command: result.command || "rejected",
      code: result.code ?? null,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error,
      at: new Date(),
    };
    setLog((entries) => [entry, ...entries].slice(0, 40));
    return entry;
  }, []);

  return {
    log,
    toast,
    notify,
    record,
    busy,
    setBusy,
    dismiss: () => setToast(null),
  };
}
