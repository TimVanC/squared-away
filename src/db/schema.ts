import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const repeatTypeEnum = pgEnum("repeat_type", [
  "daily",
  "weekdays",
  "range",
  "once",
]);
export const taskKindEnum = pgEnum("task_kind", ["normal", "water"]);
export const logTypeEnum = pgEnum("log_type", ["none", "actual_time", "number"]);
export const dayTypeEnum = pgEnum("day_type", ["close", "open", "prep", "off"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Theme = {
  background: string;
  headerText: string;
  tile: string;
  tileText: string;
  doneTile: string;
  doneText: string;
};

export const settings = pgTable("settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: jsonb("theme").$type<Theme>(),
  calorieTarget: integer("calorie_target").default(0).notNull(),
  proteinTarget: integer("protein_target").default(0).notNull(),
  waterGoalOz: integer("water_goal_oz").default(100).notNull(),
  waterGoalShiftOz: integer("water_goal_shift_oz").default(120).notNull(),
  myPlan: text("my_plan").default("").notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
});

export const lists = pgTable(
  "lists",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [index("lists_user_idx").on(t.userId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note").default("").notNull(),
    time: text("time"), // HH:MM, nullable = Anytime
    repeatType: repeatTypeEnum("repeat_type").default("daily").notNull(),
    repeatDays: integer("repeat_days").array().default([]).notNull(), // 0=Sun..6=Sat
    startDate: date("start_date"),
    endDate: date("end_date"),
    onceDate: date("once_date"),
    kind: taskKindEnum("kind").default("normal").notNull(),
    waterOz: integer("water_oz"),
    logType: logTypeEnum("log_type").default("none").notNull(),
    logUnit: text("log_unit"),
    notify: boolean("notify").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("tasks_user_idx").on(t.userId), index("tasks_list_idx").on(t.listId)],
);

export const completions = pgTable(
  "completions",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
    actualTime: text("actual_time"), // HH:MM
    value: numeric("value"),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.date] }), index("completions_date_idx").on(t.date)],
);

export const timeOverrides = pgTable(
  "time_overrides",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    time: text("time").notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.date] })],
);

export const skips = pgTable(
  "skips",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.date] })],
);

export const extras = pgTable(
  "extras",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.date] })],
);

export const dayTypes = pgTable(
  "day_types",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    type: dayTypeEnum("type").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const waterEntries = pgTable(
  "water_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    oz: integer("oz").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("water_entries_user_date_idx").on(t.userId, t.date)],
);

export const pushSubs = pgTable(
  "push_subs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("push_subs_endpoint_idx").on(t.endpoint)],
);

export const notifSent = pgTable(
  "notif_sent",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.date] })],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chat_messages_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type List = typeof lists.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Completion = typeof completions.$inferSelect;
export type DayType = (typeof dayTypeEnum.enumValues)[number];
export type RepeatType = (typeof repeatTypeEnum.enumValues)[number];
export type LogType = (typeof logTypeEnum.enumValues)[number];
export type TaskKind = (typeof taskKindEnum.enumValues)[number];
