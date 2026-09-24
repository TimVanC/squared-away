import type Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { HttpError } from "@/lib/api";

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const TEXT_EXT = new Set(["txt", "md", "csv", "markdown", "text"]);

export type AttachmentMeta = { name: string; type: string; size: number };

/** Turn an uploaded file into Messages API content blocks. */
export async function fileToBlocks(file: File): Promise<{ blocks: Anthropic.ContentBlockParam[]; meta: AttachmentMeta }> {
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, `${file.name} is larger than 8 MB`);
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const meta: AttachmentMeta = { name: file.name, type: file.type || ext, size: file.size };

  if (IMAGE_TYPES.has(file.type)) {
    return {
      meta,
      blocks: [
        { type: "image", source: { type: "base64", media_type: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: buf.toString("base64") } },
      ],
    };
  }
  if (file.type === "application/pdf" || ext === "pdf") {
    return {
      meta,
      blocks: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") }, title: file.name }],
    };
  }
  if (ext === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer: buf });
    return { meta, blocks: [{ type: "text", text: `<file name="${file.name}">\n${result.value.trim()}\n</file>` }] };
  }
  if (TEXT_EXT.has(ext) || file.type.startsWith("text/")) {
    return { meta, blocks: [{ type: "text", text: `<file name="${file.name}">\n${buf.toString("utf8")}\n</file>` }] };
  }
  throw new HttpError(415, `${file.name}: unsupported file type. Use images, PDF, Word (.docx), or text files.`);
}
