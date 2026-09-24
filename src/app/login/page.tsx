"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Wordmark from "@/components/Wordmark";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: "#1F2B4D" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Wordmark variant="navy" size="lg" />
          <p className="mt-4 text-sm" style={{ color: "#AAB3CC" }}>
            Get your day squared away.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl px-4 py-3 text-base outline-none"
            style={{ background: "#2A375E", color: "#F3F5FA" }}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl px-4 py-3 text-base outline-none"
            style={{ background: "#2A375E", color: "#F3F5FA" }}
          />
          {error && (
            <p className="text-sm px-1" style={{ color: "#FFB4B4" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-2xl px-4 py-3 font-bold text-base disabled:opacity-60"
            style={{ background: "#FFD84D", color: "#1F2B4D", boxShadow: "0 8px 20px rgba(0,0,0,.3)" }}
          >
            {busy ? "One sec..." : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="mt-6 w-full text-sm underline-offset-4 hover:underline"
          style={{ color: "#AAB3CC" }}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>
    </main>
  );
}
