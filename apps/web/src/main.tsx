import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
// Design experiments are opt-in and excluded from the production application.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("prototype")) {
  import("@/app/prototypes/health-designs/entry").then(({ DesignPrototype }) => {
    root.render(<StrictMode><DesignPrototype /></StrictMode>);
  });
} else {
  import("@/app/app").then(({ App }) => {
    root.render(<StrictMode><App /></StrictMode>);
  });
}
