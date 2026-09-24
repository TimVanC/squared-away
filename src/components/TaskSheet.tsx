"use client";

import { useEffect, useState } from "react";
import type { DayTask } from "@/lib/services/day";
import type { List } from "@/db/schema";
import { WEEKDAY_SHORT, formatDateShort } from "@/lib/dates";
import Sheet from "./Sheet";

export type TaskFormValues = {
  title: string;
  time: string | null;
  note: string;
  listId: number;
  repeatType: "daily" | "weekdays" | "range" | "once";
  repeatDays: number[];
  startDate: string | null;
  endDate: string | null;
  onceDate: string | null;
  kind: "normal" | "water";
  waterOz: number | null;
  logType: "none" | "actual_time" | "number";
  logUnit: string | null;
  notify: boolean;
  followsWake: boolean;
};

type Props = {
  task: DayTask | null; // null = create
  date: string;
  lists: List[];
  defaultListId: number;
  onSave: (values: TaskFormValues, opts: { overrideOnly: boolean }) => Promise<void>;
  onPush?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
};

export default function TaskSheet({ task, date, lists, defaultListId, onSave, onPush, onDelete, onClose }: Props) {
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [time, setTime] = useState(task?.time ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [listId, setListId] = useState<number>(task?.listId ?? defaultListId);
  const [repeatType, setRepeatType] = useState<TaskFormValues["repeatType"]>(task?.repeatType ?? "daily");
  const [repeatDays, setRepeatDays] = useState<number[]>(task?.repeatDays ?? []);
  const [startDate, setStartDate] = useState(task?.startDate ?? date);
  const [endDate, setEndDate] = useState(task?.endDate ?? "");
  const [onceDate, setOnceDate] = useState(task?.onceDate ?? date);
  const [kind, setKind] = useState<TaskFormValues["kind"]>(task?.kind ?? "normal");
  const [waterOz, setWaterOz] = useState(task?.waterOz ? String(task.waterOz) : "");
  const [logType, setLogType] = useState<TaskFormValues["logType"]>(task?.logType ?? "none");
  const [logUnit, setLogUnit] = useState(task?.logUnit ?? "");
  const [notify, setNotify] = useState(task?.notify ?? false);
  const [followsWake, setFollowsWake] = useState(task?.followsWake ?? true);
  const [overrideOnly, setOverrideOnly] = useState(false);
  const [more, setMore] = useState(!!task && (task.kind === "water" || task.logType !== "none" || task.notify));
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : { titles: [] }))
      .then((d) => {
        if (!cancelled) setRecent(d.titles ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editing]);

  const repeats = editing && task!.repeatType !== "once";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!title.trim()) {
      setError("Give it a title");
      return;
    }
    run(() =>
      onSave(
        {
          title: title.trim(),
          time: time || null,
          note: note.trim(),
          listId,
          repeatType,
          repeatDays: repeatType === "weekdays" || repeatType === "range" ? repeatDays : [],
          startDate: repeatType === "range" ? startDate || null : null,
          endDate: repeatType === "range" ? endDate || null : null,
          onceDate: repeatType === "once" ? onceDate || null : null,
          kind,
          waterOz: kind === "water" ? Number(waterOz) || null : null,
          logType,
          logUnit: logType === "number" ? logUnit.trim() || null : null,
          notify,
          followsWake,
        },
        { overrideOnly },
      ),
    );
  }

  return (
    <Sheet title={editing ? "Edit todo" : "New todo"} onClose={onClose}>
      <input
        className="field text-lg font-bold"
        placeholder="What needs doing?"
        value={title}
        autoFocus={!editing}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      {!editing && recent.length > 0 && (
        <div className="flex gap-2 overflow-x-auto mt-2 pb-1 -mx-1 px-1">
          {recent.map((r) => (
            <button key={r} type="button" className="chip-light" onClick={() => setTitle(r)}>
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label">Time</div>
          <div className="flex gap-2">
            <input type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
            {time && (
              <button type="button" className="chip-light" onClick={() => setTime("")} aria-label="Clear time">
                ✕
              </button>
            )}
          </div>
        </div>
        <div>
          <div className="label">List</div>
          <select className="field" value={listId} onChange={(e) => setListId(Number(e.target.value))}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {repeats && time !== (task!.baseTime ?? "") && (
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={overrideOnly} onChange={(e) => setOverrideOnly(e.target.checked)} />
          Only change the time for {formatDateShort(date)}
        </label>
      )}

      <div className="label">Note</div>
      <input className="field" placeholder="Short note shown on the tile" value={note} onChange={(e) => setNote(e.target.value)} />

      <div className="label">Repeat</div>
      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            ["daily", "Every day"],
            ["weekdays", "Weekdays"],
            ["range", "Date range"],
            ["once", "One day"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" className={`seg ${repeatType === v ? "seg-active" : ""}`} onClick={() => setRepeatType(v)}>
            {label}
          </button>
        ))}
      </div>

      {(repeatType === "weekdays" || repeatType === "range") && (
        <div className="flex gap-1.5 mt-2">
          {WEEKDAY_SHORT.map((d, i) => (
            <button
              key={d}
              type="button"
              className={`seg flex-1 ${repeatDays.includes(i) ? "seg-active" : ""}`}
              onClick={() => setRepeatDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()))}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      {repeatType === "range" && (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <div className="label">From</div>
            <input type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <div className="label">To (optional)</div>
            <input type="date" className="field" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      )}
      {repeatType === "once" && (
        <div className="mt-2">
          <div className="label">Date</div>
          <input type="date" className="field" value={onceDate} onChange={(e) => setOnceDate(e.target.value)} />
        </div>
      )}

      <button type="button" className="mt-4 text-sm font-bold opacity-70" onClick={() => setMore((m) => !m)}>
        {more ? "Hide options" : "More options: water, logging, notifications"}
      </button>
      {more && (
        <div className="mt-2 rounded-2xl p-3" style={{ background: "#f4f5f9" }}>
          <div className="label mt-0">Tile type</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className={`seg ${kind === "normal" ? "seg-active" : ""}`} onClick={() => setKind("normal")}>
              Normal
            </button>
            <button type="button" className={`seg ${kind === "water" ? "seg-active" : ""}`} onClick={() => setKind("water")}>
              Water checkpoint
            </button>
          </div>
          {kind === "water" && (
            <div className="mt-2 flex items-center gap-2">
              <input type="number" inputMode="numeric" className="field" placeholder="Ounces" value={waterOz} onChange={(e) => setWaterOz(e.target.value)} />
              <span className="font-bold opacity-70">oz</span>
            </div>
          )}

          <div className="label">Log on complete</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["none", "Just done"],
                ["actual_time", "Actual time"],
                ["number", "Number"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" className={`seg ${logType === v ? "seg-active" : ""}`} onClick={() => setLogType(v)}>
                {label}
              </button>
            ))}
          </div>
          {logType === "number" && (
            <input className="field mt-2" placeholder="Unit, e.g. lbs or miles" value={logUnit} onChange={(e) => setLogUnit(e.target.value)} />
          )}

          <label className="flex items-center justify-between mt-4 text-sm font-bold">
            Notify me at the task time
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-5 h-5" />
          </label>
          <label className="flex items-center justify-between mt-3 text-sm font-bold">
            <span>
              Moves with day type
              <span className="block text-xs font-normal opacity-60">Shifts earlier or later with the sleep table</span>
            </span>
            <input type="checkbox" checked={followsWake} onChange={(e) => setFollowsWake(e.target.checked)} className="w-5 h-5" />
          </label>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: "#a12626" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2 mt-5">
        {editing && onDelete && (
          <button
            type="button"
            className="sheet-btn sheet-btn-danger"
            disabled={busy}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              run(onDelete);
            }}
          >
            {confirmDelete ? "Really delete?" : "Delete"}
          </button>
        )}
        {editing && onPush && (
          <button type="button" className="sheet-btn" disabled={busy} onClick={() => run(onPush)}>
            Push to tomorrow
          </button>
        )}
        <button type="button" className="sheet-btn sheet-btn-primary flex-1 disabled:opacity-60" disabled={busy} onClick={submit}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
