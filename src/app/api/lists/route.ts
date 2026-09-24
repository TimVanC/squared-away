import { NextResponse } from "next/server";
import { HttpError, readJson, withUser } from "@/lib/api";
import { getLists } from "@/lib/services/day";
import { createList, deleteList, renameList } from "@/lib/services/lists";

export const GET = withUser(async (userId) => {
  return NextResponse.json({ lists: await getLists(userId) });
});

export const POST = withUser(async (userId, req) => {
  const body = await readJson<{ name: string }>(req);
  return NextResponse.json({ list: await createList(userId, body.name ?? "") });
});

export const PATCH = withUser(async (userId, req) => {
  const body = await readJson<{ id: number; name: string }>(req);
  if (!Number.isInteger(body.id)) throw new HttpError(400, "Bad id");
  return NextResponse.json({ list: await renameList(userId, body.id, body.name ?? "") });
});

export const DELETE = withUser(async (userId, req) => {
  const body = await readJson<{ id: number }>(req);
  if (!Number.isInteger(body.id)) throw new HttpError(400, "Bad id");
  await deleteList(userId, body.id);
  return NextResponse.json({ ok: true });
});
