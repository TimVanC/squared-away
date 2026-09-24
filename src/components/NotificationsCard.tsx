"use client";

import { useEffect, useState } from "react";

type State = "unsupported" | "needs-homescreen" | "default" | "granted" | "denied" | "subscribed";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * "Enable notifications" card for settings. Permission is requested from a tap, never on load.
 * On iOS this only works once the app is added to the home screen (iOS 16.4+).
 */
export default function NotificationsCard({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>("default");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Capability detection runs once on mount; the state it sets comes from browser APIs.
    detect();
  }, []);

  function detect() {
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState(isIOS && !standalone ? "needs-homescreen" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : Notification.permission === "granted" ? "granted" : "default"))
      .catch(() => setState("default"));
  }

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      if (!vapidPublicKey) throw new Error("Push is not configured on the server (missing VAPID key).");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        throw new Error("Permission was not granted.");
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("Could not save the subscription.");
      setState("subscribed");
      setMessage("Notifications are on for this device.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("granted");
      setMessage("Notifications are off for this device.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      setMessage(`Sent to ${data.sent} device${data.sent === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not send a test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Notifications</h2>
      <p className="text-xs opacity-60 mb-3">
        Tasks with &quot;Notify me&quot; on send a push at their time. On iPhone, add the app to your home screen first (Share, then Add to Home Screen).
      </p>
      {state === "needs-homescreen" && <p className="text-sm">Open the app from your home screen icon to enable notifications.</p>}
      {state === "unsupported" && <p className="text-sm">This browser does not support web push.</p>}
      {state === "denied" && <p className="text-sm">Notifications are blocked. Allow them in your browser or phone settings, then come back.</p>}
      {(state === "default" || state === "granted") && (
        <button type="button" className="chip chip-active" disabled={busy} onClick={enable}>
          Enable notifications
        </button>
      )}
      {state === "subscribed" && (
        <div className="flex gap-2">
          <button type="button" className="chip chip-active" disabled={busy} onClick={sendTest}>
            Send a test
          </button>
          <button type="button" className="chip" disabled={busy} onClick={disable}>
            Turn off
          </button>
        </div>
      )}
      {message && <p className="text-sm mt-2">{message}</p>}
    </section>
  );
}
