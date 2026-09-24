"use client";

import type { DayTask } from "@/lib/services/day";
import Tile from "./Tile";

type Props = {
  tasks: DayTask[];
  poppingId: number | null;
  onSingleTap: (task: DayTask) => void;
  onDoubleTap: (task: DayTask) => void;
  emptyMessage?: string;
};

export default function TaskGrid({ tasks, poppingId, onSingleTap, onDoubleTap, emptyMessage }: Props) {
  if (tasks.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm opacity-70" style={{ color: "var(--header-text)" }}>
        {emptyMessage ?? "Nothing here yet. Add a todo or ask the AI to plan your day."}
      </p>
    );
  }
  return (
    <div className="tile-grid">
      {tasks.map((t) => (
        <Tile key={t.id} task={t} popping={poppingId === t.id} onSingleTap={onSingleTap} onDoubleTap={onDoubleTap} />
      ))}
    </div>
  );
}
