import { cn } from "@/lib/utils";
import type { SyncFailure, SyncRun, SyncTrigger } from "@/features/sync/hooks/use-sync";
import type { Toast } from "@/lib/types";
import type { Overview } from "@/lib/types";
import { IconSync, IconWarning } from "@/lib/icons";
import { attentionItems, describeSync } from "@/features/sync/lib/status";
import { useNow } from "@/features/sync/hooks/use-now";

/**
 * The app's one status surface, modelled on the iPhone's Dynamic Island: a
 * black capsule at the top centre. At rest it shows Google Health sync in two
 * compact slots, like a Live Activity. A notice grows it downward into a card
 * for a few seconds. Clicking it opens the sync sheet, which grows out of the
 * same spot.
 */
export function Island({
  overview,
  last,
  failure,
  running,
  busy,
  toast,
  expanded,
  onOpen,
  onDismiss,
}: {
  overview: Overview | null;
  last: SyncRun | null;
  failure: SyncFailure | null;
  running: SyncTrigger | null;
  /** A CLI command other than sync is running. */
  busy: boolean;
  toast: Toast | null;
  expanded: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const now = useNow();
  const attention = attentionItems(overview, last).length;
  const summary = describeSync({ overview, last, failure, running, attention, now });
  const line = summary.brief ? `${summary.label} · ${summary.brief}` : summary.label;
  const working = Boolean(running) || busy;
  const mode = toast ? "notice" : working ? "working" : "rest";
  return (
    <div
      className={`island absolute top-2.5 [left:50%] z-[2] w-59 [translate:-50%_0] grid grid-rows-[36px_0fr] rounded-[18px] [background:#000] text-white shadow-[0_0_0_1px_rgb(255_255_255_/_0.07),_0_8px_30px_rgb(0_0_0_/_0.5)] overflow-hidden [&.working]:w-63 [&.notice]:w-[min(440px,_calc(100vw_-_24px))] [&.notice]:grid-rows-[44px_1fr] [&.notice]:rounded-[26px] [&:has(.island-pill:active)]:[scale:0.97] [transition:width_var(--spring-bounce-time)_var(--spring-bounce),_grid-template-rows_var(--spring-bounce-time)_var(--spring-bounce),_border-radius_var(--spring-bounce-time)_var(--spring-bounce),_scale_160ms_var(--ease-out)] [&.work_.island-lead]:text-protein [&.warn_.island-lead]:text-warning [&.busy_.island-lead]:text-protein [&.working_.island-lead]:text-protein [&.warn_.island-trail]:text-warning [&.notice_.island-notice-inner]:opacity-[1] [&.notice_.island-notice-inner]:delay-[120ms] [&.bad_.island-message_span]:[color:#ffb4ae] max-[521px]:top-13.5 max-[381px]:[&.notice]:w-[calc(100vw_-_16px)] ${mode} ${summary.tone}${toast?.bad ? " bad" : ""}`}
    >
      <button
        className={cn(
          "island-pill grid grid-cols-[20px_minmax(0,_1fr)_auto] items-center gap-2 h-full w-full [padding:0_14px_0_12px]",
          "border-0 bg-transparent text-inherit text-left [&:active:not(:disabled)]:[transform:none]"
        )}
        type="button"
        onClick={onOpen}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={"Google Health sync, " + line}
      >
        <span className="island-lead grid place-items-center w-5 h-5 rounded-full [color:#8e8e93]" aria-hidden>
          {summary.tone === "warn" ? (
            <IconWarning size={15} />
          ) : (
            <IconSync size={15} className={working ? "spin animate-[spin_900ms_linear_infinite]" : undefined} />
          )}
        </span>
        <span className="island-label overflow-hidden whitespace-nowrap text-ellipsis text-[12.5px] font-semibold tracking-[-0.005em]" aria-hidden>
          {busy && !running ? "Running" : summary.label}
        </span>
        <span className="island-trail [color:#98989f] text-[11.5px] whitespace-nowrap" aria-hidden>
          {working ? <i className={cn(
            "island-wave inline-block w-[3px] h-3 rounded-[2px] bg-protein animate-[wave_900ms_ease-in-out_infinite]",
            "[&::before]:inline-block [&::before]:w-[3px] [&::before]:h-3 [&::before]:rounded-[2px] [&::before]:bg-protein",
            "[&::before]:animate-[wave_900ms_ease-in-out_infinite] [&::after]:inline-block [&::after]:w-[3px] [&::after]:h-3",
            "[&::after]:rounded-[2px] [&::after]:bg-protein [&::after]:animate-[wave_900ms_ease-in-out_infinite] relative",
            "my-0 mx-[7px] [vertical-align:middle] [animation-delay:-300ms] [&::before]:[content:''] [&::before]:absolute",
            "[&::before]:top-0 [&::after]:[content:''] [&::after]:absolute [&::after]:top-0 [&::before]:[left:-6px]",
            "[&::before]:[animation-delay:-600ms] [&::after]:left-1.5"
          )} /> : summary.brief}
        </span>
      </button>
      <div className="island-notice min-h-0 overflow-hidden">
        <div className="island-notice-inner [padding:0_18px_16px_44px] opacity-[0] [transition:opacity_220ms_ease]">
          {toast && (
            <div role={toast.bad ? "alert" : "status"} className={cn(
              "island-message flex items-start justify-between gap-3.5 text-[13px] leading-[1.45] [color:#e5e5ea]",
              "[&_button]:shrink-0 [&_button]:border-0 [&_button]:rounded-full [&_button]:py-[3px] [&_button]:px-2.5",
              "[&_button]:[background:rgb(255_255_255_/_0.12)] [&_button]:text-white [&_button]:text-[11.5px]",
              "[&_button]:font-[590] pointer-hover:[&_button:hover]:[background:rgb(255_255_255_/_0.2)]"
            )}>
              <span>{toast.message}</span>
              <button type="button" onClick={onDismiss}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
