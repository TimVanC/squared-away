"use client";

import { useState } from "react";
import type { DayTask } from "@/lib/services/day";
import { formatTime12 } from "@/lib/dates";
import { useTap } from "@/hooks/useTap";

type Props = {
  task: DayTask;
  popping: boolean;
  onSingleTap: (task: DayTask) => void;
  onDoubleTap: (task: DayTask) => void;
};

export default function Tile({ task, popping, onSingleTap, onDoubleTap }: Props) {
  const [pressed, setPressed] = useState(false);
  const done = !!task.completion;
  const handleTap = useTap(
    () => onSingleTap(task),
    () => onDoubleTap(task),
  );

  return (
    <button
      type="button"
      onClick={handleTap}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className={`tile ${done ? "tile-done" : "tile-open"} ${pressed ? "tile-pressed" : ""} ${popping ? "tile-pop" : ""}`}
      aria-pressed={done}
      aria-label={`${task.title}${done ? ", done" : ""}`}
    >
      <div className="tile-time">
        <span>{formatTime12(task.time)}</span>
        {done && task.completion?.actualTime && task.completion.actualTime !== task.time && (
          <span className="tile-actual">actual {formatTime12(task.completion.actualTime)}</span>
        )}
        {done && task.logType === "number" && task.completion?.value !== null && task.completion?.value !== undefined && (
          <span className="tile-actual">
            {task.completion.value} {task.logUnit ?? ""}
          </span>
        )}
      </div>
      <div className="tile-title">{task.title}</div>
      {task.note && <div className="tile-note">{task.note}</div>}
      {task.kind === "water" && <div className="tile-badge">💧</div>}
    </button>
  );
}
