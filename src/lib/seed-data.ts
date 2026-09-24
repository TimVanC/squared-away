// Seed data from PRD section 7 and the My Plan text from PRD section 3.
// Applied ONLY to the account whose email matches SEED_USER_EMAIL (see src/lib/seed.ts).
// No other code path references anything in this file.

import type { LogType, TaskKind } from "@/db/schema";

export const SEED_SETTINGS = {
  calorieTarget: 3000,
  proteinTarget: 180,
  waterGoalOz: 100,
  waterGoalShiftOz: 120,
  timezone: "America/New_York",
  dayTypeTimes: {
    close: { wake: "10:00", bed: "02:00" },
    open: { wake: "09:30", bed: "01:30" },
    off: { wake: "08:30", bed: "00:30" },
    prep: { wake: "07:30", bed: "23:30" },
  },
};

export const SEED_LISTS = ["Daily", "Fitness", "Work"];

export type SeedTask = {
  list: string;
  title: string;
  note: string;
  time: string | null;
  repeatType: "daily" | "weekdays";
  repeatDays?: number[];
  kind?: TaskKind;
  waterOz?: number;
  logType?: LogType;
  logUnit?: string;
  notify?: boolean;
  followsWake?: boolean;
};

export const SEED_TASKS: SeedTask[] = [
  { list: "Daily", time: "08:30", title: "Wake up", note: "Daylight within 30 min", repeatType: "daily", logType: "actual_time", notify: true },
  { list: "Daily", time: "08:45", title: "Shake #1 + creatine", note: "2 cups milk, 1 scoop whey, 2 tbsp PB powder, 5g creatine", repeatType: "daily", notify: true },
  { list: "Daily", time: "12:30", title: "Meal 1", note: "With fish oil and zinc", repeatType: "daily" },
  { list: "Daily", time: "16:00", title: "Shake #2", note: "Or right after a shift", repeatType: "daily" },
  { list: "Daily", time: "19:30", title: "Meal 2", note: "Get a vegetable in", repeatType: "daily" },
  { list: "Daily", time: "09:30", title: "20 oz water", note: "Water checkpoint, 20 oz", repeatType: "daily", kind: "water", waterOz: 20 },
  { list: "Daily", time: "13:30", title: "30 oz water", note: "Water checkpoint, 30 oz", repeatType: "daily", kind: "water", waterOz: 30 },
  { list: "Daily", time: "18:30", title: "30 oz water", note: "Water checkpoint, 30 oz", repeatType: "daily", kind: "water", waterOz: 30 },
  { list: "Daily", time: "23:30", title: "20 oz water", note: "Water checkpoint, 20 oz. Fiber glass counts.", repeatType: "daily", kind: "water", waterOz: 20 },
  { list: "Daily", time: null, title: "One pouch at a time", note: "3mg only. Never two.", repeatType: "daily", followsWake: false },
  { list: "Daily", time: "23:30", title: "Fiber, greens, beet", note: "Psyllium + full glass of water", repeatType: "daily" },
  { list: "Daily", time: "00:30", title: "Screens off, lights out", note: "No Overwatch, no scrolling", repeatType: "daily", logType: "actual_time", notify: true },
  { list: "Daily", time: "22:30", title: "Weigh-in", note: "Same time every week", repeatType: "weekdays", repeatDays: [1], logType: "number", logUnit: "lbs", notify: true, followsWake: false },
];

export const SEED_MY_PLAN = `# My Plan

## Work

- Barback at Elizabeth's Italian, usually 4 days a week. Commute 40 to 80 min each way.
- Bar is closed Mondays.
- Shift types: Prep 10 a.m. to 3 p.m., Open 12 to 6 p.m., Close 6 p.m. to midnight (home about 1 a.m.)

## Sleep by shift

Anchor wake time, 8 hours every night.

| Day type | Bed | Wake |
|---|---|---|
| Close | 2:00 a.m. | 10:00 a.m. |
| Open | 1:30 a.m. | 9:30 a.m. |
| Off | 12:30 a.m. | 8:30 a.m. |
| Prep | 11:30 p.m. | 7:30 a.m. |

- Daylight within 30 minutes of waking
- After a close: shower, eat, lights out. No games or scrolling.
- Avoid prep shifts right after a close when possible.

## Nutrition targets

- Weeks 1 to 2: 3,000 calories, 180g protein
- Week 3 onward: 3,500 calories, 200g protein
- Display only (header), not tracked or checked off. Editable in settings.

## Daily routine (order matters, times come from shift type)

1. Wake up: first water checkpoint (20 oz)
2. Shake #1 with 5g creatine
3. Meal 1 with fish oil and zinc (zinc on an empty stomach causes nausea)
4. Shake #2: afternoon or right after a shift
5. Meal 2
6. Evening fiber: psyllium husk, super greens, beetroot powder with a full glass of water, about 1 hour before bed and at least 2 hours away from other supplements
7. Screens off, lights out

All day:
- 100 oz water (120 on bar shifts), split into 4 checkpoints tracked on the water meter. Drink during each pouch-free window.
- Water checkpoints are anchored to that day's wake and bed times, front-loaded, tapered at night:
  - Wake-up water: within 1 hr of waking. 20 oz (off day) / 20 oz (shift day)
  - Midday: wake + 5 hrs. 30 oz / 35 oz
  - Afternoon or on shift: wake + 10 hrs. 30 oz / 40 oz
  - Evening: 1 hr before bed (fiber glass counts). 20 oz / 25 oz
- Pouch-free windows: pouch out 15 min before eating or drinking, none for 30 min after
- One 3mg pouch at a time. Never two.

## Shake (shaker bottle, about 480 cal, 45g protein)

- 2 cups whole milk
- 1 scoop chocolate whey
- 2 tbsp peanut butter powder
- Milk first, then powders, shake 20 seconds. Sip over 15 minutes.

## Meals (batch cook 2 on Sunday or Monday)

I don't like chicken. Beef and steak.
- Beef rice bowls: ground beef, rice, peppers and onions, sauce
- Steak and potatoes with frozen broccoli or green beans
- Beef chili: ground beef, beans, tomatoes, onions
- Taco bowls: beef, rice, black beans, cheese, salsa
- Always include a vegetable. Snacks: high-protein Uncrustables, nuts, Greek yogurt.

## Training

Lifting: 5-day split, Push A / Pull A / Legs + Shoulders / Push B / Pull B, core 1 to 2x a week. Start at 60 to 70% of old working weights and add weight each session. If the week gets disrupted, drop to 3 days and alternate A and B weeks. No full-body or upper/lower.

Running: 2 zone 2 runs a week. Start at 1 to 2 miles of continuous easy running and add distance as it feels comfortable. Stay conversational pace, not sprinter pace.

Scheduling rules: Never during a shift. Lift on off days or before close shifts. Runs can share a day with a lift.

Weigh-in: every Monday night, same time each week. Watch the trend over weeks, not single readings.

## Rules for staying on track

- Motivation follows action. Do the first tiny step.
- On bad days, do the minimum version (10 minutes still counts).
- Never miss twice in a row.
- Make bad habits harder: Overwatch uninstalled, betting apps deleted, pouches out of pocket.
`;
