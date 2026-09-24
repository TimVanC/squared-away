"use client";

import { useState } from "react";
import type { ChatAction } from "@/lib/ai/chat";

const ICON: Record<string, string> = {
  list_tasks: "📋",
  get_logs: "📈",
  create_task: "➕",
  update_task: "✏️",
  delete_task: "🗑️",
  set_time_override: "🕒",
  set_day_type: "📅",
  complete_task: "✅",
};

type Props = {
  action: ChatAction;
  messageId: number | null;
  onUndone: (actionId: string) => void;
};

/** Compact card for one tool action in the thread, with Undo when reversible. */
export default function ActionCard({ action, messageId, onUndone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUndo = !!action.undo && !action.undone && messageId !== null;

  async function undo() {
    if (!messageId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, actionId: action.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not undo");
      onUndone(action.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`action-card ${action.ok ? "" : "action-card-error"} ${action.undone ? "action-card-undone" : ""}`}>
      <span className="action-icon">{ICON[action.name] ?? "⚙️"}</span>
      <div className="min-w-0 flex-1">
        <div className="action-summary">{action.summary}</div>
        {action.detail && <div className="action-detail">{action.detail}</div>}
        {error && <div className="action-detail" style={{ color: "#ffb4b4" }}>{error}</div>}
      </div>
      {action.undone ? (
        <span className="action-undone-label">Undone</span>
      ) : canUndo ? (
        <button type="button" className="action-undo" disabled={busy} onClick={undo}>
          {busy ? "..." : "Undo"}
        </button>
      ) : null}
    </div>
  );
}
