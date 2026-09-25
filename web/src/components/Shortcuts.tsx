const SHORTCUTS: [string, string][] = [
  ["← →", "previous / next day"],
  ["↑ ↓", "previous / next week"],
  ["[ ]", "previous / next month"],
  ["T", "today"],
  ["F or /", "add food"],
  ["W", "add weight"],
  ["⇧W", "weight trends"],
  ["1–5", "log the Nth recent food again"],
  ["P", "pending work"],
  ["Esc", "close"],
  ["?", "this list"],
];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel" onClick={(event) => event.stopPropagation()}>
        <h2>Shortcuts</h2>
        <dl>
          {SHORTCUTS.map(([key, meaning]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt>{key}</dt><dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
