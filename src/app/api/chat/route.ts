import Anthropic from "@anthropic-ai/sdk";
import { errorResponse, HttpError } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { fileToBlocks, type AttachmentMeta } from "@/lib/ai/files";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { runTool, toolDefinitions, toolSchemas, type ToolName } from "@/lib/ai/tools";
import {
  anthropic,
  loadHistory,
  MAX_ITERATIONS,
  MODEL,
  saveMessage,
  toolResultBlock,
  toStoredBlocks,
  type ChatAction,
  type StoredAssistant,
  type StoredToolResults,
  type StoredUser,
} from "@/lib/ai/chat";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Event =
  | { type: "user_saved"; id: number }
  | { type: "assistant_start"; id: number }
  | { type: "text"; delta: string }
  | { type: "action_start"; action: { id: string; name: string } }
  | { type: "action"; action: ChatAction }
  | { type: "done"; id: number }
  | { type: "error"; message: string };

/**
 * POST multipart/form-data: message (text), files[] (images, PDF, docx, text).
 * Streams newline-delimited JSON events while Claude responds and calls tools.
 */
export async function POST(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch (err) {
    return errorResponse(err);
  }

  let text = "";
  const blocks: Anthropic.ContentBlockParam[] = [];
  const attachments: AttachmentMeta[] = [];
  try {
    const form = await req.formData();
    text = String(form.get("message") ?? "").trim();
    for (const entry of form.getAll("files")) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      const { blocks: b, meta } = await fileToBlocks(entry);
      blocks.push(...b);
      attachments.push(meta);
    }
    if (!text && blocks.length === 0) throw new HttpError(400, "Say something or attach a file");
  } catch (err) {
    return errorResponse(err);
  }
  if (text) blocks.push({ type: "text", text });
  else blocks.push({ type: "text", text: "(see attached)" });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const history = await loadHistory(userId);
        const userStored: StoredUser = { kind: "user", text, attachments, api: [{ type: "text", text: text || "(see attached)" }] };
        const userId_ = await saveMessage(userId, "user", userStored);
        send({ type: "user_saved", id: userId_ });

        const { system } = await buildSystemPrompt(userId);
        const tools = toolDefinitions();
        const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: blocks }];
        const client = anthropic();

        // One assistant row per API turn; each may carry text and tool calls.
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const assistantRowId = await saveMessage(userId, "assistant", { kind: "assistant", text: "", actions: [], api: [] } satisfies StoredAssistant);
          send({ type: "assistant_start", id: assistantRowId });

          const s = client.messages.stream({
            model: MODEL,
            max_tokens: 32000,
            system,
            tools,
            messages,
            thinking: { type: "adaptive" },
          });
          s.on("text", (delta) => send({ type: "text", delta }));
          s.on("contentBlock", (block) => {
            if (block.type === "tool_use") send({ type: "action_start", action: { id: block.id, name: block.name } });
          });

          let message: Anthropic.Message;
          try {
            message = await s.finalMessage();
          } catch (err) {
            if (err instanceof Anthropic.APIError) throw err;
            // Unparseable tool input JSON (eager streaming): re-issue once.
            if (iter === 0) continue;
            throw err;
          }

          const textOut = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
          const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

          if (message.stop_reason === "refusal") {
            await updateAssistant(assistantRowId, { kind: "assistant", text: textOut || "I can't help with that one.", actions: [], api: toStoredBlocks(message.content) });
            send({ type: "done", id: assistantRowId });
            break;
          }
          if (message.stop_reason === "max_tokens" && toolUses.length) {
            throw new Error("The response was cut off before the tool call finished. Try a smaller request.");
          }

          const actions: ChatAction[] = [];
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const schema = toolSchemas[tu.name as ToolName];
            const parsed = schema ? schema.safeParse(tu.input) : null;
            const result = parsed && !parsed.success
              ? { ok: false, summary: `Invalid input for ${tu.name}`, data: { INVALID_JSON: JSON.stringify(tu.input), issues: parsed.error.issues } }
              : await runTool(userId, tu.name, tu.input);
            const action: ChatAction = { id: tu.id, name: tu.name, input: tu.input, ok: result.ok, summary: result.summary, detail: result.detail, undo: result.undo };
            actions.push(action);
            results.push(toolResultBlock(tu.id, result));
            send({ type: "action", action });
          }

          await updateAssistant(assistantRowId, { kind: "assistant", text: textOut, actions, api: toStoredBlocks(message.content) });
          messages.push({ role: "assistant", content: message.content });

          if (message.stop_reason !== "tool_use" || results.length === 0) {
            send({ type: "done", id: assistantRowId });
            break;
          }
          await saveMessage(userId, "user", { kind: "tool_results", api: results } satisfies StoredToolResults);
          messages.push({ role: "user", content: results });
          if (iter === MAX_ITERATIONS - 1) {
            send({ type: "text", delta: "\n\nI hit the tool-call limit for one message. Say \"continue\" and I'll keep going." });
            send({ type: "done", id: assistantRowId });
          }
        }
      } catch (err) {
        const message =
          err instanceof Anthropic.AuthenticationError
            ? "The Anthropic API key is invalid."
            : err instanceof Anthropic.RateLimitError
              ? "Rate limited by the Anthropic API. Try again in a minute."
              : err instanceof Anthropic.APIError
                ? `Anthropic API error ${err.status}: ${err.message}`
                : err instanceof Error
                  ? err.message
                  : "Something went wrong";
        console.error("chat error", err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

async function updateAssistant(id: number, content: StoredAssistant) {
  const { db } = await import("@/db");
  const { chatMessages } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(chatMessages).set({ content }).where(eq(chatMessages.id, id));
}
