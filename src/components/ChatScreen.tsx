"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatAction, ThreadMessage } from "@/lib/ai/chat";
import Wordmark from "./Wordmark";
import ActionCard from "./ActionCard";
import Composer from "./Composer";

type Pending = { id: number | null; text: string; actions: ChatAction[]; pendingTools: { id: string; name: string }[] };

export default function ChatScreen() {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/chat/messages", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Loads the thread on mount; state is set after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, pending?.text, pending?.actions.length]);

  async function send(text: string, files: File[]) {
    setBusy(true);
    setError(null);
    const tempUser: ThreadMessage = {
      id: -Date.now(),
      role: "user",
      createdAt: new Date().toISOString(),
      kind: "user",
      text,
      attachments: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    };
    setMessages((m) => [...m, tempUser]);
    setPending({ id: null, text: "", actions: [], pendingTools: [] });

    const form = new FormData();
    form.set("message", text);
    for (const f of files) form.append("files", f, f.name);
    abort.current = new AbortController();

    try {
      const res = await fetch("/api/chat", { method: "POST", body: form, signal: abort.current.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let current: Pending = { id: null, text: "", actions: [], pendingTools: [] };
      const finished: ThreadMessage[] = [];

      const flushCurrent = () => {
        if (current.id !== null && (current.text || current.actions.length)) {
          finished.push({ id: current.id, role: "assistant", createdAt: new Date().toISOString(), kind: "assistant", text: current.text, actions: current.actions });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          switch (ev.type) {
            case "assistant_start":
              flushCurrent();
              current = { id: ev.id, text: "", actions: [], pendingTools: [] };
              break;
            case "text":
              current = { ...current, text: current.text + ev.delta };
              break;
            case "action_start":
              current = { ...current, pendingTools: [...current.pendingTools, ev.action] };
              break;
            case "action":
              current = { ...current, actions: [...current.actions, ev.action], pendingTools: current.pendingTools.filter((p) => p.id !== ev.action.id) };
              break;
            case "error":
              setError(ev.message);
              break;
          }
          setPending({ ...current });
          if (finished.length) {
            setMessages((m) => [...m, ...finished.splice(0)]);
          }
        }
      }
      flushCurrent();
      if (finished.length) setMessages((m) => [...m, ...finished]);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(null);
      setBusy(false);
      abort.current = null;
      void load();
    }
  }

  function markUndone(messageId: number, actionId: string) {
    setMessages((m) => m.map((msg) => (msg.id === messageId && msg.kind === "assistant" ? { ...msg, actions: msg.actions.map((a) => (a.id === actionId ? { ...a, undone: true } : a)) } : msg)));
  }

  async function clearChat() {
    if (!window.confirm("Clear the whole chat history?")) return;
    await fetch("/api/chat/messages", { method: "DELETE" });
    setMessages([]);
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <Link href="/" className="nav-btn" aria-label="Back to today" style={{ width: 40, height: 40, fontSize: 24 }}>
          ‹
        </Link>
        <Wordmark />
        <button type="button" className="chip" onClick={clearChat} disabled={busy}>
          New chat
        </button>
      </header>

      <div className="chat-thread">
        {loaded && messages.length === 0 && !pending && (
          <div className="chat-empty">
            <p className="font-bold text-lg">Plan my day.</p>
            <p className="text-sm opacity-75 mt-1">
              Upload a screenshot of your bar schedule and say &quot;plan my next two weeks.&quot; Or ask how your wake time has been, or what to eat today.
            </p>
          </div>
        )}
        {messages.map((m) =>
          m.kind === "user" ? (
            <div key={m.id} className="bubble-user-wrap">
              <div className="bubble-user">
                {m.attachments.length > 0 && (
                  <div className="bubble-files">
                    {m.attachments.map((a, i) => (
                      <span key={i} className="bubble-file">
                        {a.type.startsWith("image/") ? "🖼️" : "📄"} {a.name}
                      </span>
                    ))}
                  </div>
                )}
                {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
              </div>
            </div>
          ) : (
            <AssistantMessage key={m.id} id={m.id} text={m.text} actions={m.actions} pendingTools={[]} onUndone={(aid) => markUndone(m.id, aid)} />
          ),
        )}
        {pending && (
          <AssistantMessage id={pending.id} text={pending.text} actions={pending.actions} pendingTools={pending.pendingTools} streaming onUndone={() => {}} />
        )}
        {error && <div className="chat-error">{error}</div>}
        <div ref={bottom} style={{ height: 1 }} />
      </div>

      <Composer disabled={busy} onSend={send} />
    </div>
  );
}

function AssistantMessage({
  id,
  text,
  actions,
  pendingTools,
  streaming,
  onUndone,
}: {
  id: number | null;
  text: string;
  actions: ChatAction[];
  pendingTools: { id: string; name: string }[];
  streaming?: boolean;
  onUndone: (actionId: string) => void;
}) {
  return (
    <div className="bubble-assistant">
      {actions.map((a) => (
        <ActionCard key={a.id} action={a} messageId={id} onUndone={onUndone} />
      ))}
      {pendingTools.map((p) => (
        <div key={p.id} className="action-card action-card-pending">
          <span className="action-icon">⏳</span>
          <span className="action-summary">{p.name.replace(/_/g, " ")}...</span>
        </div>
      ))}
      {text && (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
      {streaming && !text && actions.length === 0 && pendingTools.length === 0 && <div className="chat-typing">Thinking...</div>}
    </div>
  );
}
