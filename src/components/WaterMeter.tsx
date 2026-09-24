"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  total: number;
  goal: number;
  onAdd: (oz: number) => void;
};

/**
 * Horizontal water meter that fills from 0 to the daily goal. The fill animates
 * smoothly and the surface waves for a moment whenever the total changes.
 * Tapping the bar opens quick +8 / +16 / -8 oz buttons for water outside a checkpoint.
 */
export default function WaterMeter({ total, goal, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [wave, setWave] = useState(false);
  const prev = useRef(total);

  useEffect(() => {
    if (prev.current === total) return;
    prev.current = total;
    setWave(true);
    const id = window.setTimeout(() => setWave(false), 1400);
    return () => window.clearTimeout(id);
  }, [total]);

  const pct = goal > 0 ? Math.max(0, Math.min(100, (total / goal) * 100)) : 0;
  const full = goal > 0 && total >= goal;

  return (
    <div className="px-5 pt-2 pb-3">
      <button
        type="button"
        className={`water ${wave ? "water-wave" : ""} ${full ? "water-full" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Water ${total} of ${goal} ounces. Tap to log extra water.`}
      >
        <div className="water-fill" style={{ width: `${pct}%` }}>
          <svg className="water-surface" viewBox="0 0 24 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,0 C8,10 4,20 10,30 C16,40 8,50 12,60 L24,60 L24,0 Z" />
          </svg>
        </div>
        <div className="water-label">
          <span className="water-icon">💧</span>
          <span>
            {total} / {goal} oz
          </span>
          <span className="water-hint">{full ? "goal hit" : "tap to add"}</span>
        </div>
      </button>
      {open && (
        <div className="flex gap-2 mt-2">
          {[8, 16].map((oz) => (
            <button
              key={oz}
              type="button"
              className="chip chip-active flex-1 py-2"
              onClick={() => {
                onAdd(oz);
                setOpen(false);
              }}
            >
              +{oz} oz
            </button>
          ))}
          <button
            type="button"
            className="chip flex-1 py-2"
            onClick={() => {
              onAdd(-8);
              setOpen(false);
            }}
            disabled={total <= 0}
          >
            −8 oz
          </button>
          <button type="button" className="chip py-2" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
