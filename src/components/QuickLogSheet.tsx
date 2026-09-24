"use client";

import { useState } from "react";
import type { DayTask } from "@/lib/services/day";
import { nowTimeIn } from "@/lib/dates";
import Sheet from "./Sheet";

type Props = {
  task: DayTask;
  timezone: string;
  onSubmit: (log: { actualTime?: string | null; value?: number | null }) => void;
  onSkip: () => void;
};

/**
 * Pops up right after a double tap on a task with a log type.
 * actual_time: "Actual time?" prefilled with now. number: a value with a unit.
 * One tap to confirm, or skip.
 */
export default function QuickLogSheet({ task, timezone, onSubmit, onSkip }: Props) {
  const [time, setTime] = useState(() => nowTimeIn(timezone));
  const [value, setValue] = useState("");

  if (task.logType === "actual_time") {
    return (
      <Sheet title="Actual time?" onClose={onSkip}>
        <p className="text-sm opacity-70 mb-3">
          {task.title} was planned for {task.time ? formatPlanned(task.time) : "anytime"}.
        </p>
        <input type="time" className="field text-2xl font-bold text-center" value={time} onChange={(e) => setTime(e.target.value)} />
        <div className="flex gap-2 mt-4">
          <button type="button" className="sheet-btn flex-1" onClick={onSkip}>
            Skip
          </button>
          <button type="button" className="sheet-btn sheet-btn-primary flex-1" onClick={() => onSubmit({ actualTime: time || null })}>
            Log {time}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={`${task.title}: value?`} onClose={onSkip}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          autoFocus
          className="field text-2xl font-bold text-center"
          placeholder="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value !== "") onSubmit({ value: Number(value) });
          }}
        />
        {task.logUnit && <span className="font-bold text-lg opacity-70">{task.logUnit}</span>}
      </div>
      <div className="flex gap-2 mt-4">
        <button type="button" className="sheet-btn flex-1" onClick={onSkip}>
          Skip
        </button>
        <button
          type="button"
          className="sheet-btn sheet-btn-primary flex-1 disabled:opacity-50"
          disabled={value === "" || !Number.isFinite(Number(value))}
          onClick={() => onSubmit({ value: Number(value) })}
        >
          Log
        </button>
      </div>
    </Sheet>
  );
}

function formatPlanned(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}
