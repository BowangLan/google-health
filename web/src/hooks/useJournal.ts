import { useEffect, useState } from "react";
import * as api from "../lib/api";
import type { DayView } from "../lib/types";

export function useJournal(day: string, revision: number) {
  const [view, setView] = useState<DayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api
      .getDay(day)
      .then((data) => {
        if (live) setView(data);
      })
      .catch((cause) => {
        if (live)
          setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [day, revision, attempt]);
  return {
    view: view?.day === day ? view : null,
    error,
    loading,
    retry: () => setAttempt((value) => value + 1),
  };
}
