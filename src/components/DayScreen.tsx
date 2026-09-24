"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DayTask, DayView } from "@/lib/services/day";
import type { DayType } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { sortDayTasks } from "@/lib/sort";
import Header, { DAY_TYPE_LABEL } from "./Header";
import TaskGrid from "./TaskGrid";
import WaterMeter from "./WaterMeter";
import ThemeVars from "./ThemeVars";

type Props = { initialDate: string; timezone: string };

const POP_MS = 420;

export default function DayScreen({ initialDate, timezone }: Props) {
  const [date, setDate] = useState(initialDate);
  const [today, setToday] = useState(initialDate);
  const [view, setView] = useState<DayView | null>(null);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [listId, setListId] = useState<number | "all">("all");
  const [poppingId, setPoppingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayTypePicker, setDayTypePicker] = useState(false);
  const reqSeq = useRef(0);
  const router = useRouter();
  const tz = view?.timezone ?? timezone;

  const load = useCallback(
    async (d: string, opts: { silent?: boolean } = {}) => {
      const seq = ++reqSeq.current;
      try {
        const res = await fetch(`/api/day?date=${d}`, { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error("Could not load the day");
        const data = (await res.json()) as DayView;
        if (seq !== reqSeq.current) return;
        setView(data);
        setTasks(data.tasks);
        if (!opts.silent) setError(null);
      } catch (e) {
        if (seq === reqSeq.current) setError(e instanceof Error ? e.message : "Something went wrong");
      }
    },
    [router],
  );

  useEffect(() => {
    // Data fetch on date change; state updates happen after the response, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(date);
  }, [date, load]);

  // Midnight reset + refresh when coming back to the app.
  useEffect(() => {
    const tick = () => {
      const t = todayIn(tz);
      if (t !== today) {
        setToday(t);
        setDate((d) => (d === today ? t : d));
      }
    };
    const id = window.setInterval(tick, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        tick();
        load(date, { silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [tz, today, date, load]);

  const visibleTasks = useMemo(() => (listId === "all" ? tasks : tasks.filter((t) => t.listId === listId)), [tasks, listId]);
  const doneCount = tasks.filter((t) => t.completion).length;

  const waterTotal = useMemo(() => {
    if (!view) return 0;
    const fromCheckpoints = tasks.filter((t) => t.kind === "water" && t.completion).reduce((s, t) => s + (t.waterOz ?? 0), 0);
    return fromCheckpoints + view.water.fromEntries;
  }, [tasks, view]);

  async function toggleComplete(task: DayTask) {
    const wasDone = !!task.completion;
    const now = new Date().toISOString();
    // Optimistic update in place, then re-sort after the pop animation.
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completion: wasDone ? null : { completedAt: now, actualTime: null, value: null, note: null } } : t)));
    setPoppingId(task.id);
    window.setTimeout(() => {
      setPoppingId((p) => (p === task.id ? null : p));
      setTasks((prev) => sortDayTasks(prev));
    }, POP_MS);

    try {
      const res = await fetch("/api/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, date, done: !wasDone }),
      });
      if (!res.ok) throw new Error("Could not save");
    } catch {
      setError("Could not save that. Check your connection.");
      load(date, { silent: true });
    }
  }

  async function addWater(oz: number) {
    setView((v) => (v ? { ...v, water: { ...v.water, fromEntries: v.water.fromEntries + oz } } : v));
    try {
      const res = await fetch("/api/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, oz }),
      });
      if (!res.ok) throw new Error("Could not save");
    } catch {
      setError("Could not save that. Check your connection.");
    }
    load(date, { silent: true });
  }

  function onSingleTap(task: DayTask) {
    // Step 5/6 wire the edit sheet (open tiles) and the log sheet (done tiles).
    void task;
  }

  async function chooseDayType(type: DayType | null) {
    setDayTypePicker(false);
    setView((v) => (v ? { ...v, dayType: type } : v));
    await fetch("/api/day-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, type }),
    });
    load(date, { silent: true });
  }

  return (
    <ThemeVars theme={view?.theme}>
      <div className="app-bg min-h-dvh">
        <div className="mx-auto w-full max-w-[480px] pb-28">
          <Header
            date={date}
            today={today}
            dayType={view?.dayType ?? null}
            doneCount={doneCount}
            totalCount={tasks.length}
            calorieTarget={view?.calorieTarget ?? 0}
            proteinTarget={view?.proteinTarget ?? 0}
            onChangeDate={setDate}
            onTapDayType={() => setDayTypePicker(true)}
          />

          <WaterMeter total={waterTotal} goal={view?.water.goal ?? 100} onAdd={addWater} />

          {view && view.lists.length > 1 && (
            <div className="flex gap-2 px-4 py-2 overflow-x-auto">
              <button type="button" className={`chip ${listId === "all" ? "chip-active" : ""}`} onClick={() => setListId("all")}>
                All
              </button>
              {view.lists.map((l) => (
                <button key={l.id} type="button" className={`chip ${listId === l.id ? "chip-active" : ""}`} onClick={() => setListId(l.id)}>
                  {l.name}
                </button>
              ))}
            </div>
          )}

          <div className="px-4 pt-2">
            <button type="button" className="add-btn">
              + Add a todo
            </button>
          </div>

          {error && (
            <p className="px-4 pt-2 text-sm" style={{ color: "#FFB4B4" }}>
              {error}
            </p>
          )}

          {view ? (
            <TaskGrid tasks={visibleTasks} poppingId={poppingId} onSingleTap={onSingleTap} onDoubleTap={toggleComplete} />
          ) : (
            !error && <p className="px-4 py-10 text-center text-sm opacity-60">Loading...</p>
          )}
        </div>

        {dayTypePicker && (
          <div className="sheet-backdrop" onClick={() => setDayTypePicker(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <h2 className="sheet-title">Day type</h2>
              <div className="grid grid-cols-2 gap-2">
                {(["close", "open", "prep", "off"] as DayType[]).map((t) => (
                  <button key={t} type="button" className={`sheet-btn ${view?.dayType === t ? "sheet-btn-primary" : ""}`} onClick={() => chooseDayType(t)}>
                    {DAY_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <button type="button" className="sheet-btn mt-2 w-full" onClick={() => chooseDayType(null)}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </ThemeVars>
  );
}
