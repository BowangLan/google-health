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
        "shortcut-content [padding:20px_22px_6px] [&_h3]:text-[13px] [&_dl]:grid [&_dl]:grid-cols-[auto_1fr]",
        "[&_dl]:gap-y-[11px] [&_dl]:gap-x-6 [&_dl]:[margin:14px_0_24px] [&_dl]:text-[12.5px] [&_dt]:justify-self-start",
        "[&_dt]:py-0 [&_dt]:px-[7px] [&_dt]:rounded-[6px] [&_dt]:bg-secondary [&_dt]:text-foreground [&_dt]:font-[560]",
        "[&_dd]:text-muted-foreground [&_dd]:m-0"
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
