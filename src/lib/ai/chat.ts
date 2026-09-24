import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import type { AttachmentMeta } from "./files";
import type { ActionResult, Undo } from "./tools";

export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
export const MAX_ITERATIONS = 12;
const HISTORY_ROWS = 80;

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Keys that are not scoped to a workspace must name one per request.
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
  }
  return client;
}

/** What a tool call looks like in the thread (card with undo). */
export type ChatAction = {
  id: string; // tool_use id
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;
  detail?: string;
  undo?: Undo;
  undone?: boolean;
};

/** Stored message shapes (chat_messages.content). */
export type StoredUser = { kind: "user"; text: string; attachments: AttachmentMeta[]; api: Anthropic.ContentBlockParam[] };
export type StoredAssistant = { kind: "assistant"; text: string; actions: ChatAction[]; api: Anthropic.ContentBlockParam[] };
export type StoredToolResults = { kind: "tool_results"; api: Anthropic.ToolResultBlockParam[] };
export type Stored = StoredUser | StoredAssistant | StoredToolResults;

export type ThreadMessage = { id: number; role: "user" | "assistant"; createdAt: string } & (
  | { kind: "user"; text: string; attachments: AttachmentMeta[] }
  | { kind: "assistant"; text: string; actions: ChatAction[] }
);

export async function saveMessage(userId: number, role: "user" | "assistant", content: Stored): Promise<number> {
  const [row] = await db.insert(chatMessages).values({ userId, role, content }).returning({ id: chatMessages.id });
  return row.id;
}

/** Thread for the UI (tool-result rows hidden). */
export async function loadThread(userId: number, limit = 200): Promise<ThreadMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  rows.reverse();
  const out: ThreadMessage[] = [];
  for (const r of rows) {
    const c = r.content as Stored;
    if (c.kind === "user") out.push({ id: r.id, role: "user", createdAt: r.createdAt.toISOString(), kind: "user", text: c.text, attachments: c.attachments });
    else if (c.kind === "assistant") out.push({ id: r.id, role: "assistant", createdAt: r.createdAt.toISOString(), kind: "assistant", text: c.text, actions: c.actions });
  }
  return out;
}

export async function clearThread(userId: number) {
  await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
}

export async function markActionUndone(userId: number, messageId: number, actionId: string) {
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.userId, userId)))
    .limit(1);
  if (!row) return null;
  const c = row.content as Stored;
  if (c.kind !== "assistant") return null;
  const action = c.actions.find((a) => a.id === actionId);
  if (!action || !action.undo || action.undone) return null;
  const updated: StoredAssistant = { ...c, actions: c.actions.map((a) => (a.id === actionId ? { ...a, undone: true } : a)) };
  await db.update(chatMessages).set({ content: updated }).where(eq(chatMessages.id, messageId));
  return action;
}

/**
 * Rebuild the API message history from stored rows. Strips file bytes (only
 * the current message carries them) and drops tool_use blocks that never got a result.
 */
export async function loadHistory(userId: number): Promise<Anthropic.MessageParam[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(HISTORY_ROWS);
  rows.reverse();

  const msgs: Anthropic.MessageParam[] = [];
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].content as Stored;
    if (c.kind === "user") {
      const blocks: Anthropic.ContentBlockParam[] = c.api.filter((b) => b.type === "text");
      const files = c.attachments.map((a) => a.name);
      if (files.length) blocks.push({ type: "text", text: `[Attached earlier: ${files.join(", ")}. The file contents are no longer available; ask the user to re-attach if needed.]` });
      if (blocks.length === 0) blocks.push({ type: "text", text: c.text || "(empty)" });
      msgs.push({ role: "user", content: blocks });
    } else if (c.kind === "assistant") {
      const next = rows[i + 1]?.content as Stored | undefined;
      const resultIds = new Set(next?.kind === "tool_results" ? next.api.map((r) => r.tool_use_id) : []);
      const blocks = c.api.filter((b) => b.type === "text" || (b.type === "tool_use" && resultIds.has(b.id)));
      if (blocks.length === 0) continue;
      msgs.push({ role: "assistant", content: blocks });
    } else if (c.kind === "tool_results") {
      const prev = msgs[msgs.length - 1];
      const useIds = new Set(prev?.role === "assistant" && Array.isArray(prev.content) ? prev.content.filter((b) => b.type === "tool_use").map((b) => (b as Anthropic.ToolUseBlockParam).id) : []);
      const blocks = c.api.filter((r) => useIds.has(r.tool_use_id));
      if (blocks.length) msgs.push({ role: "user", content: blocks });
    }
  }
  // History must start with a user message.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

/** Strip thinking blocks and trim what we persist. */
export function toStoredBlocks(content: Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] {
  const out: Anthropic.ContentBlockParam[] = [];
  for (const b of content) {
    if (b.type === "text") out.push({ type: "text", text: b.text });
    else if (b.type === "tool_use") out.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
  }
  return out;
}

export function toolResultBlock(id: string, result: ActionResult): Anthropic.ToolResultBlockParam {
  return { type: "tool_result", tool_use_id: id, is_error: !result.ok, content: JSON.stringify(result.data) };
}

export async function deleteMessages(userId: number, ids: number[]) {
  if (!ids.length) return;
  await db.delete(chatMessages).where(and(eq(chatMessages.userId, userId), inArray(chatMessages.id, ids)));
}

export { asc };
