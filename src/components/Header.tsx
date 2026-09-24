"use client";

import Link from "next/link";
import Wordmark from "./Wordmark";
import { addDays, formatDateShort } from "@/lib/dates";
import type { DayType } from "@/db/schema";

type Props = {
  date: string;
  today: string;
  dayType: DayType | null;
  doneCount: number;
  totalCount: number;
  calorieTarget: number;
  proteinTarget: number;
  onChangeDate: (date: string) => void;
  onTapDayType?: () => void;
};

export const DAY_TYPE_LABEL: Record<DayType, string> = { close: "Close", open: "Open", prep: "Prep", off: "Off" };

export default function Header({
  date,
  today,
  dayType,
  doneCount,
  totalCount,
  calorieTarget,
  proteinTarget,
  onChangeDate,
  onTapDayType,
}: Props) {
  const isToday = date === today;
  const rel = date === addDays(today, 1) ? "Tomorrow" : date === addDays(today, -1) ? "Yesterday" : isToday ? "Today" : null;
  const showTargets = calorieTarget > 0 || proteinTarget > 0;
  const targetLine = [calorieTarget > 0 ? `${calorieTarget.toLocaleString()} cal` : null, proteinTarget > 0 ? `${proteinTarget}g protein` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="px-4 pt-3 pb-2" style={{ color: "var(--header-text)" }}>
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link href="/settings" aria-label="Settings" className="p-2 -mr-2 opacity-80 hover:opacity-100">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button type="button" aria-label="Previous day" className="nav-btn" onClick={() => onChangeDate(addDays(date, -1))}>
          ‹
        </button>
        <div className="flex flex-col items-center leading-tight">
          <div className="text-lg font-bold">{formatDateShort(date)}</div>
          <div className="text-xs opacity-70 h-4">{rel}</div>
        </div>
        <button type="button" aria-label="Next day" className="nav-btn" onClick={() => onChangeDate(addDays(date, 1))}>
          ›
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {doneCount} of {totalCount} done
          </span>
          {showTargets && <span className="opacity-70">· {targetLine}</span>}
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <button type="button" className="chip" onClick={() => onChangeDate(today)}>
              Today
            </button>
          )}
          <button
            type="button"
            className="chip"
            onClick={onTapDayType}
            aria-label="Day type"
            style={dayType ? { background: "var(--tile)", color: "var(--tile-text)" } : { opacity: 0.6 }}
          >
            {dayType ? DAY_TYPE_LABEL[dayType] : "Set day"}
          </button>
        </div>
      </div>
    </header>
  );
}
