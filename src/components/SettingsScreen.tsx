"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { DayTypeTimes, List, Theme } from "@/db/schema";
import Wordmark from "./Wordmark";
import ThemeVars from "./ThemeVars";
import LogoutButton from "./LogoutButton";
import NotificationsCard from "./NotificationsCard";

type Values = {
  theme: Theme;
  calorieTarget: number;
  proteinTarget: number;
  waterGoalOz: number;
  waterGoalShiftOz: number;
  myPlan: string;
  timezone: string;
  dayTypeTimes: DayTypeTimes;
};

const DAY_TYPES: [keyof DayTypeTimes, string][] = [
  ["close", "Close"],
  ["open", "Open"],
  ["prep", "Prep"],
  ["off", "Off"],
];

type Props = {
  email: string;
  initial: Values;
  defaultTheme: Theme;
  initialLists: List[];
  vapidPublicKey: string;
};

const THEME_FIELDS: [keyof Theme, string][] = [
  ["background", "Background"],
  ["headerText", "Header text"],
  ["tile", "Tile"],
  ["tileText", "Tile text"],
  ["doneTile", "Done tile"],
  ["doneText", "Done text"],
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
];

export default function SettingsScreen({ email, initial, defaultTheme, initialLists, vapidPublicKey }: Props) {
  const [values, setValues] = useState<Values>(initial);
  const [lists, setLists] = useState<List[]>(initialLists);
  const [newList, setNewList] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof Values>(key: K, v: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const dayTypeTimes: DayTypeTimes = {};
      for (const [key] of DAY_TYPES) {
        const v = values.dayTypeTimes[key];
        if (v?.wake && v?.bed) dayTypeTimes[key] = v;
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, dayTypeTimes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setStatus("Saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function addList() {
    const name = newList.trim();
    if (!name) return;
    const res = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "Could not add list");
      return;
    }
    setLists((prev) => [...prev, data.list]);
    setNewList("");
  }

  async function removeList(list: List) {
    if (!window.confirm(`Delete the "${list.name}" list and every task in it?`)) return;
    const res = await fetch("/api/lists", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: list.id }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "Could not delete list");
      return;
    }
    setLists((prev) => prev.filter((l) => l.id !== list.id));
  }

  const tz = TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES];

  return (
    <ThemeVars theme={values.theme}>
      <div className="app-bg min-h-dvh" style={{ color: "var(--header-text)" }}>
        <div className="mx-auto w-full max-w-[480px] px-4 pt-3 pb-16">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="nav-btn" style={{ width: 36, height: 36, fontSize: 22 }}>
                ‹
              </span>
              <Wordmark />
            </Link>
            <LogoutButton />
          </div>
          <h1 className="text-2xl font-extrabold mt-5">Settings</h1>
          <p className="text-sm opacity-70">{email}</p>

          <section className="card">
            <h2 className="card-title">Targets</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calories / day" value={values.calorieTarget} onChange={(v) => set("calorieTarget", v)} />
              <Field label="Protein (g) / day" value={values.proteinTarget} onChange={(v) => set("proteinTarget", v)} />
              <Field label="Water (oz), off days" value={values.waterGoalOz} onChange={(v) => set("waterGoalOz", v)} />
              <Field label="Water (oz), shift days" value={values.waterGoalShiftOz} onChange={(v) => set("waterGoalShiftOz", v)} />
            </div>
            <p className="text-xs opacity-60 mt-2">Set calories or protein to 0 to hide the line in the header.</p>
          </section>

          <section className="card">
            <h2 className="card-title">Theme</h2>
            <div className="grid grid-cols-2 gap-3">
              {THEME_FIELDS.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2" style={{ background: "rgba(255,255,255,.08)" }}>
                  <span className="text-sm font-semibold">{label}</span>
                  <input
                    type="color"
                    value={values.theme[key]}
                    onChange={(e) => set("theme", { ...values.theme, [key]: e.target.value.toUpperCase() })}
                    className="h-8 w-10 rounded-lg border-0 bg-transparent"
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-3 items-center">
              <div className="tile tile-open" style={{ width: 84, aspectRatio: "1", padding: 8 }}>
                <div className="tile-time">8:30 AM</div>
                <div className="tile-title">Open tile</div>
              </div>
              <div className="tile tile-done" style={{ width: 84, aspectRatio: "1", padding: 8 }}>
                <div className="tile-time">8:30 AM</div>
                <div className="tile-title">Done tile</div>
              </div>
              <button type="button" className="chip ml-auto" onClick={() => set("theme", defaultTheme)}>
                Reset to default
              </button>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Sleep by day type</h2>
            <p className="text-xs opacity-60 mb-3">
              Each row is the night after that shift. A Close means lights out at its bed time that night and waking at its wake time the next morning. Tile times are off-day times; setting a day type shifts that evening and the next morning by the difference from Off. Shifts and one-off tasks stay put.
            </p>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 items-center">
              <span />
              <span className="text-xs font-bold opacity-70">Bed</span>
              <span className="text-xs font-bold opacity-70">Wake</span>
              {DAY_TYPES.map(([key, label]) => (
                <Fragment key={key}>
                  <span className="text-sm font-semibold">{label}</span>
                  <input
                    type="time"
                    className="field"
                    style={{ background: "rgba(255,255,255,.08)", color: "var(--header-text)", padding: "8px 10px" }}
                    value={values.dayTypeTimes[key]?.bed ?? ""}
                    onChange={(e) => set("dayTypeTimes", { ...values.dayTypeTimes, [key]: { wake: values.dayTypeTimes[key]?.wake ?? "", bed: e.target.value } })}
                  />
                  <input
                    type="time"
                    className="field"
                    style={{ background: "rgba(255,255,255,.08)", color: "var(--header-text)", padding: "8px 10px" }}
                    value={values.dayTypeTimes[key]?.wake ?? ""}
                    onChange={(e) => set("dayTypeTimes", { ...values.dayTypeTimes, [key]: { wake: e.target.value, bed: values.dayTypeTimes[key]?.bed ?? "" } })}
                  />
                </Fragment>
              ))}
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">My Plan</h2>
            <p className="text-xs opacity-60 mb-2">The AI reads this on every message. Keep it current: schedule, sleep, nutrition, training, rules.</p>
            <textarea
              className="field font-mono text-[13px]"
              style={{ background: "rgba(255,255,255,.08)", color: "var(--header-text)", minHeight: 260 }}
              value={values.myPlan}
              onChange={(e) => set("myPlan", e.target.value)}
              placeholder="Empty. Tell the AI about your schedule and goals, or write your plan here."
            />
          </section>

          <section className="card">
            <h2 className="card-title">Timezone</h2>
            <select
              className="field"
              style={{ background: "rgba(255,255,255,.08)", color: "var(--header-text)" }}
              value={values.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            >
              {tz.map((z) => (
                <option key={z} value={z} style={{ color: "#1F2B4D" }}>
                  {z}
                </option>
              ))}
            </select>
          </section>

          <div className="sticky bottom-4 mt-4 flex items-center gap-3">
            <button type="button" className="sheet-btn sheet-btn-primary flex-1 disabled:opacity-60" style={{ boxShadow: "0 8px 20px rgba(0,0,0,.3)" }} disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save settings"}
            </button>
            {status && <span className="text-sm font-semibold">{status}</span>}
          </div>

          <section className="card">
            <h2 className="card-title">Lists</h2>
            <ul className="flex flex-col gap-2">
              {lists.map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: "rgba(255,255,255,.08)" }}>
                  <span className="font-semibold">{l.name}</span>
                  <button type="button" className="chip" onClick={() => removeList(l)} disabled={lists.length <= 1}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-3">
              <input
                className="field"
                style={{ background: "rgba(255,255,255,.08)", color: "var(--header-text)" }}
                placeholder="New list name"
                value={newList}
                onChange={(e) => setNewList(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addList();
                }}
              />
              <button type="button" className="chip chip-active" onClick={addList}>
                Add
              </button>
            </div>
          </section>

          <NotificationsCard vapidPublicKey={vapidPublicKey} />

          <section className="card">
            <h2 className="card-title">Data</h2>
            <p className="text-xs opacity-60 mb-3">Every completion, actual time, value, and note as a CSV.</p>
            <a href="/api/export" className="chip chip-active inline-block" download>
              Export CSV
            </a>
          </section>
        </div>
      </div>
    </ThemeVars>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold opacity-70">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        className="field mt-1"
        style={{ background: "rgba(255,255,255,.08)", color: "var(--header-text)" }}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}
