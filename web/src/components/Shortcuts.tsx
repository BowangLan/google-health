import { Dialog } from "./Dialog";

const GLOBAL = [
  ["J", "Open today’s journal"],
  ["G", "Open trends"],
  ["P", "Review sync"],
  ["?", "Keyboard shortcuts"],
  ["Esc", "Close dialog"],
];
const JOURNAL = [
  ["← / →", "Previous / next day"],
  ["↑ / ↓", "Previous / next week"],
  ["T", "Return to today"],
  ["D", "Choose a date"],
  ["F or /", "Log food to the displayed day"],
  ["W", "Log weight to the displayed day"],
];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <div className="shortcut-content">
        <h3>Anywhere</h3>
        <dl>
          {GLOBAL.map(([key, text]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt>{key}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <h3>In Journal</h3>
        <p>These act only on the day shown in Journal.</p>
        <dl>
          {JOURNAL.map(([key, text]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt>{key}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}
