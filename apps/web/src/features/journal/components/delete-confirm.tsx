import { Button } from "@/components/button";
import { useState } from "react";
import * as api from "@/lib/api";
import type { FoodRow, Kind, WeightRow } from "@/lib/types";
/** Deleting a synced record stages a remote deletion; the copy has to say so. */
export function DeleteConfirm({ kind, record, title, onDone, onCancel }: {
  kind: Kind;
  record: FoodRow | WeightRow;
  title: string;
  onDone: (message: string, staged: boolean) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const synced = record.state === "synced";

  async function remove() {
    setBusy(true);
    try {
      const result = await api.deleteRecord(kind, record.path);
      onDone(
        result.staged_remote_delete
          ? "Deleted locally. Push to remove it from Google Health."
          : "Deleted.",
        result.staged_remote_delete,
      );
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <div className="confirm [&_.buttons]:[padding:4px_0_0] p-5.5 grid gap-4.5 text-[13px] max-[761px]:p-4.5">
      <div>
        {problem ?? (synced
          ? `Delete “${title}”? The local file goes now. Google Health keeps it until your next push, which will delete it there too.`
          : `Delete “${title}”? It was never sent to Google Health.`)}
      </div>
      <div className="buttons flex items-center gap-2 [padding:8px_22px_20px] [&_.primary]:[flex:1]">
        {!problem && (
          <Button variant="secondary" className="danger" type="button" disabled={busy} onClick={remove}>
            Delete
          </Button>
        )}
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
