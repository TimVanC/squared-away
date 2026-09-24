"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (not in lib.dom for every TS target).
type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor; SpeechRecognition?: SpeechRecognitionCtor };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

/**
 * Live dictation with the Web Speech API. `interim` is the gray in-progress text;
 * `onFinal` receives finalized chunks to append to the composer.
 */
export function useDictation(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });
  useEffect(() => {
    // Feature detection after hydration so server and client render the same first frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0].transcript;
        if (res.isFinal) onFinalRef.current(t.trim() + " ");
        else interimText += t;
      }
      setInterim(interimText);
    };
    r.onend = () => {
      // Safari and Chrome stop after silence; restart while the user still wants to listen.
      if (rec.current === r) {
        try {
          r.start();
        } catch {
          setListening(false);
          rec.current = null;
        }
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        rec.current = null;
        setListening(false);
        setInterim("");
      }
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, interim, start, stop, toggle: () => (listening ? stop() : start()) };
}
