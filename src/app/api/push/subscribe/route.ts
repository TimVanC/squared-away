import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubs } from "@/db/schema";
import { HttpError, readJson, withUser } from "@/lib/api";

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/** Save this device's push subscription for the logged-in user. */
export const POST = withUser(async (userId, req) => {
  const body = await readJson<Body>(req);
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new HttpError(400, "Bad subscription");
  await db
    .insert(pushSubs)
    .values({ userId, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubs.endpoint, set: { userId, p256dh, auth } });
  return NextResponse.json({ ok: true });
});

export const DELETE = withUser(async (userId, req) => {
  const body = await readJson<{ endpoint?: string }>(req);
  if (!body.endpoint) throw new HttpError(400, "Bad request");
  await db.delete(pushSubs).where(and(eq(pushSubs.userId, userId), eq(pushSubs.endpoint, body.endpoint)));
  return NextResponse.json({ ok: true });
});
