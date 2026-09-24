import { NextResponse } from "next/server";
import { runNotificationSweep } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

/**
 * Called every few minutes by Vercel Cron (Authorization: Bearer CRON_SECRET)
 * or an external scheduler (?secret=CRON_SECRET). Sends due task notifications.
 */
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runNotificationSweep();
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
