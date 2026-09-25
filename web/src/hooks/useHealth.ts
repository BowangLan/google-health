import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { DayView, MonthView, Overview, Targets } from "../lib/types";

/**
 * All four reads the shell needs, and one refresh that reloads whichever of
 * them a mutation could have changed. Kept deliberately plain: this is a
 * single-user local tool, so there is nothing to cache across sessions.
 */
export function useHealth() {
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [monthView, setMonthView] = useState<MonthView | null>(null);
  const [dayView, setDayView] = useState<DayView | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [targets, setTargets] = useState<Targets>({
    daily_kcal: null, daily_protein_g: null, weight_unit: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  const loadMonth = useCallback(async (which?: string) => {
    const view = await api.getMonth(which);
    setMonthView(view);
    setMonth(view.month);
    return view;
  }, []);

  const loadDay = useCallback(async (day: string) => {
    setLoadingDay(true);
    try {
      setDayView(await api.getDay(day));
    } finally {
      setLoadingDay(false);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    setOverview(await api.getOverview());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [view, stored] = await Promise.all([api.getMonth(), api.getTargets()]);
        setMonthView(view);
        setMonth(view.month);
        setSelected(view.today);
        setTargets(stored);
        await Promise.all([loadDay(view.today), loadOverview()]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [loadDay, loadOverview]);

  // The pending pill can change without this tab doing anything, if the CLI is
  // used in a terminal at the same time.
  useEffect(() => {
    const id = window.setInterval(() => { loadOverview().catch(() => {}); }, 60000);
    return () => window.clearInterval(id);
  }, [loadOverview]);

  const refresh = useCallback(async () => {
    const jobs: Promise<unknown>[] = [loadMonth(month ?? undefined), loadOverview()];
    if (selected) jobs.push(loadDay(selected));
    await Promise.all(jobs);
  }, [loadDay, loadMonth, loadOverview, month, selected]);

  const select = useCallback((day: string) => {
    setSelected(day);
    const which = day.slice(0, 7);
    if (which !== month) loadMonth(which).catch(() => {});
    loadDay(day).catch(() => {});
  }, [loadDay, loadMonth, month]);

  const stepMonth = useCallback((delta: number) => {
    if (!month) return;
    const [year, index] = month.split("-").map(Number);
    const date = new Date(year!, (index ?? 1) - 1 + delta, 1);
    loadMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`)
      .catch(() => {});
  }, [loadMonth, month]);

  return {
    month, monthView, selected, dayView, overview, targets, error, loadingDay,
    setTargets, select, stepMonth, refresh, loadOverview,
  };
}
