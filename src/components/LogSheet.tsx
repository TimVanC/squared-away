"use client";

import { useState } from "react";
import type { DayTask } from "@/lib/services/day";
import { formatTime12 } from "@/lib/dates";
import Sheet from "./Sheet";

type Props = {
  task: DayTask;
  date: string;
  onSave: (log: { actualTime: string | null; value: number | null; note: string | null }) => Promise<void>;
  onUndo: () => void;
  onClose: () => void;
};

/** Opens on a single tap of a completed tile: note, actual time, value. */
export default function LogSheet({ task, date, onSave, onUndo, onClose }: Props) {
  const c = task.completion!;
  const [actualTime, setActualTime] = useState(c.actualTime ?? "");
  const [value, setValue] = useState(c.value === null ? "" : String(c.value));
  const [note, setNote] = useState(c.note ?? "");
  const [busy, setBusy] = useState(false);

  const completedAt = new Date(c.completedAt);
  const completedLabel = completedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <Sheet title={task.title} onClose={onClose}>
      <p className="text-sm opacity-70">
        Done {completedLabel}
        {task.time ? ` · planned ${formatTime12(task.time)}` : ""} · {date}
      </p>

      {(task.logType === "actual_time" || c.actualTime) && (
        <>
          <div className="label">Actual time</div>
          <input type="time" className="field" value={actualTime} onChange={(e) => setActualTime(e.target.value)} />
        </>
      )}

      {(task.logType === "number" || c.value !== null) && (
        <>
          <div className="label">Value{task.logUnit ? ` (${task.logUnit})` : ""}</div>
          <input type="number" inputMode="decimal" step="any" className="field" value={value} onChange={(e) => setValue(e.target.value)} />
        </>
      )}

      {task.kind === "water" && (
        <p className="text-sm mt-3 opacity-70">Logged {task.waterOz} oz on the water meter.</p>
      )}

      <div className="label">Note</div>
      <textarea
        className="field"
        rows={3}
        placeholder="e.g. hit snooze twice"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="flex gap-2 mt-4">
        <button type="button" className="sheet-btn flex-1" onClick={onUndo}>
          Undo done
        </button>
        <button
          type="button"
          className="sheet-btn sheet-btn-primary flex-1 disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                actualTime: actualTime || null,
                value: value === "" ? null : Number(value),
                note: note.trim() || null,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
