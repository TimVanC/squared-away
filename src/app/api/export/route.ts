import { withUser } from "@/lib/api";
import { getLogs } from "@/lib/services/day";
import { todayIn } from "@/lib/dates";
import { getSettings } from "@/lib/services/day";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of every completion log for the logged-in user. */
export const GET = withUser(async (userId, req) => {
  const url = new URL(req.url);
  const settings = await getSettings(userId);
  const start = url.searchParams.get("start") ?? "2000-01-01";
  const end = url.searchParams.get("end") ?? todayIn(settings.timezone);
  const rows = await getLogs(userId, start, end);
  const header = ["date", "task_id", "title", "kind", "planned_time", "completed_at", "actual_time", "value", "unit", "water_oz", "note"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.date, r.taskId, r.title, r.kind, r.plannedTime, r.completedAt, r.actualTime, r.value, r.logUnit, r.kind === "water" ? r.waterOz : null, r.note]
        .map(csvCell)
        .join(","),
    );
  }
  const body = lines.join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="squared-away-logs-${end}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
