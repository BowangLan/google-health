import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { Overview, Targets } from "@/lib/types";

/** Shared account/configuration only. Journal and Trends own their own reads. */
export function useHealth() {
  const [today, setToday] = useState<string | null>(null);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("lb");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [targets, setTargets] = useState<Targets>({
    daily_kcal: null,
    daily_protein_g: null,
    daily_deficit_kcal: 0,
    weight_unit: null,
  });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [month, stored, status] = await Promise.all([
      api.getMonth(),
      api.getTargets(),
      api.getOverview(),
    ]);
    setToday(month.today); // The server resolves America/Los_Angeles.
    setWeightUnit(month.weight_unit);
    setTargets(stored);
    setOverview(status);
    setError(null);
  }, []);

  useEffect(() => {
    void refresh().catch((cause) => setError(String(cause)));
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void api
        .getOverview()
        .then(setOverview)
        .catch(() => { });
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  return {
    today,
    weightUnit,
    overview,
    setOverview,
    targets,
    setTargets,
    error,
    refresh,
  };
}
