import { cn } from "@/lib/utils";
import { Dialog } from "@/components/dialog";

const GLOBAL = [
  ["P", "Google Health sync"],
  ["?", "Keyboard shortcuts"],
  ["Esc", "Close dialog"],
];
const DAY = [
  ["← / →", "Previous / next day"],
  ["↑ / ↓", "Previous / next week"],
  ["T", "Return to today"],
  ["D", "Choose a date"],
  ["F or /", "Log food to the selected day"],
  ["W", "Log weight to the selected day"],
];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <div className={cn(
        "shortcut-content px-6 pt-5 pb-1.5 max-[761px]:px-5 [&_h3]:text-[13px] [&_dl]:grid [&_dl]:grid-cols-[60px_minmax(0,1fr)]",
        "[&_dl]:items-center [&_dl]:gap-y-3 [&_dl]:gap-x-5 [&_dl]:[margin:14px_0_24px] [&_dl]:text-[12.5px] [&_dt]:justify-self-start",
        "[&_dt]:min-w-8 [&_dt]:text-center [&_dt]:py-0.5 [&_dt]:px-2 [&_dt]:border [&_dt]:border-solid [&_dt]:border-border [&_dt]:[font-family:var(--mono)] [&_dt]:text-[11px] [&_dt]:leading-5 [&_dt]:rounded-[6px] [&_dt]:bg-secondary [&_dt]:text-foreground [&_dt]:font-[560]",
        "[&_dd]:text-muted-foreground [&_dd]:m-0 [&_dd]:leading-[1.5]"
      )}>
        <h3>Global</h3>
        <dl>
          {GLOBAL.map(([key, text]) => (
            <div key={key} className="contents">
              <dt>{key}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <h3>Selected day</h3>
        <dl>
          {DAY.map(([key, text]) => (
            <div key={key} className="contents">
              <dt>{key}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}
