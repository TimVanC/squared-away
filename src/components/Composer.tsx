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

/**
 * One rounded pill: camera (attach) on the left, growing text field, mic, and a round send
 * button that lights up when there is something to send.
 */
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
    el.style.height = Math.min(140, el.scrollHeight) + "px";
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

  const canSend = (text.trim().length > 0 || files.length > 0) && !disabled;

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

      <div className="pill">
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <button type="button" className="pill-icon" aria-label="Attach a photo or file" onClick={() => fileInput.current?.click()} disabled={disabled}>
          <CameraIcon />
        </button>

        <div className="pill-field">
          {dictation.listening && (
            <div className="pill-live" onClick={() => textarea.current?.focus()}>
              <span>{text}</span>
              <span className="pill-interim">{dictation.interim || (text ? "" : "Listening...")}</span>
            </div>
          )}
          <textarea
            ref={textarea}
            className={dictation.listening ? "sr-only" : ""}
            rows={1}
            placeholder="Describe your day or plan"
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

        {dictation.supported && (
          <button
            type="button"
            className={`pill-icon ${dictation.listening ? "pill-mic-on" : ""}`}
            aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
            onClick={dictation.toggle}
            disabled={disabled}
          >
            <MicIcon />
          </button>
        )}

        <button type="button" className={`pill-send ${canSend ? "pill-send-on" : ""}`} aria-label="Send" onClick={send} disabled={!canSend}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
    </svg>
  );
}
