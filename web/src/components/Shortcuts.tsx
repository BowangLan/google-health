import { Dialog } from "./Dialog";

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
      <div className="shortcut-content">
        <h3>Global</h3>
        <dl>
          {GLOBAL.map(([key, text]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt>{key}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <h3>Selected day</h3>
        <dl>
          {DAY.map(([key, text]) => (
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
