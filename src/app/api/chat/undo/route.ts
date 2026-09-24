import { NextResponse } from "next/server";
import { HttpError, readJson, withUser } from "@/lib/api";
import { markActionUndone } from "@/lib/ai/chat";
import { executeUndo } from "@/lib/ai/tools";

/** Undo one AI action: { messageId, actionId }. */
export const POST = withUser(async (userId, req) => {
  const body = await readJson<{ messageId: number; actionId: string }>(req);
  if (!Number.isInteger(body.messageId) || typeof body.actionId !== "string") throw new HttpError(400, "Bad request");
  const action = await markActionUndone(userId, body.messageId, body.actionId);
  if (!action || !action.undo) throw new HttpError(404, "Nothing to undo");
  const result = await executeUndo(userId, action.undo);
  return NextResponse.json({ ok: true, result });
});
