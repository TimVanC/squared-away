"use client";

import { useEffect, useRef, useState } from "react";
import { useDictation } from "@/hooks/useDictation";

export type Attachment = { id: string; file: File; preview: string | null };

type Props = {
  disabled: boolean;
  onSend: (text: string, files: File[]) => void;
};

const ACCEPT = "image/*,.pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv";

/** Downscale big images client-side so uploads stay small. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 900_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1800;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dictation = useDictation((chunk) => setText((t) => (t.endsWith(" ") || t === "" ? t : t + " ") + chunk));

  // Grow the text field with its content.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(160, el.scrollHeight) + "px";
  }, [text, dictation.listening]);

  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Attachment[] = [];
    for (const raw of Array.from(list)) {
      const file = await shrinkImage(raw);
      next.push({ id: `${Date.now()}-${Math.random()}`, file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    }
    setFiles((prev) => [...prev, ...next]);
  }

  function send() {
    const t = text.trim();
    if ((!t && files.length === 0) || disabled) return;
    if (dictation.listening) dictation.stop();
    onSend(t, files.map((f) => f.file));
    setText("");
    setFiles([]);
  }

  const hasText = text.trim().length > 0 || files.length > 0;

  return (
    <div className="composer">
      {files.length > 0 && (
        <div className="composer-files">
          {files.map((f) => (
            <div key={f.id} className="composer-file">
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.preview} alt="" />
              ) : (
                <span className="composer-file-icon">📄</span>
              )}
              <span className="truncate">{f.file.name}</span>
              <button type="button" aria-label="Remove" onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-row">
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <button type="button" className="composer-btn" aria-label="Attach" onClick={() => fileInput.current?.click()} disabled={disabled}>
          +
        </button>
        <div className="composer-field">
          {dictation.listening && (
            <div className="composer-live" onClick={() => textarea.current?.focus()}>
              <span>{text}</span>
              <span className="composer-interim">{dictation.interim || (text ? "" : "Listening...")}</span>
            </div>
          )}
          <textarea
            ref={textarea}
            className={dictation.listening ? "sr-only" : ""}
            rows={1}
            placeholder="Message"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>
        {hasText ? (
          <button type="button" className="composer-btn composer-send" aria-label="Send" onClick={send} disabled={disabled}>
            ↑
          </button>
        ) : dictation.supported ? (
          <button
            type="button"
            className={`composer-btn ${dictation.listening ? "composer-mic-on" : ""}`}
            aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
            onClick={dictation.toggle}
            disabled={disabled}
          >
            {dictation.listening ? "■" : "🎤"}
          </button>
        ) : null}
        {hasText && dictation.supported && (
          <button
            type="button"
            className={`composer-btn ${dictation.listening ? "composer-mic-on" : ""}`}
            aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
            onClick={dictation.toggle}
            disabled={disabled}
          >
            {dictation.listening ? "■" : "🎤"}
          </button>
        )}
      </div>
    </div>
  );
}
