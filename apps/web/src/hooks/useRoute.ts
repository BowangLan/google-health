import { useCallback, useEffect, useState } from "react";
import { readRoute } from "../lib/navigation";

export function useRoute() {
  const [route, setRoute] = useState(() => readRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(readRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const navigate = useCallback((href: string, replace = false) => {
    if (replace) {
      window.history.replaceState(null, "", href);
      setRoute(readRoute(href));
    } else window.location.hash = href;
  }, []);
  return { route, navigate };
}
