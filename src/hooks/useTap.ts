"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Distinguish single taps from double taps on a tile. A single tap fires after
 * `delay` ms if no second tap arrives; a double tap fires immediately.
 */
export function useTap(onSingle: () => void, onDouble: () => void, delay = 280) {
  const timer = useRef<number | null>(null);
  const single = useRef(onSingle);
  const double = useRef(onDouble);
  useEffect(() => {
    single.current = onSingle;
    double.current = onDouble;
  });

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
      double.current();
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      single.current();
    }, delay);
  }, [delay]);
}
