"use client";

import { useEffect } from "react";
import type { Theme } from "@/db/schema";

/** Applies the user's theme colors as CSS variables on the document root. */
export default function ThemeVars({ theme, children }: { theme?: Theme | null; children: React.ReactNode }) {
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement.style;
    root.setProperty("--bg", theme.background);
    root.setProperty("--header-text", theme.headerText);
    root.setProperty("--tile", theme.tile);
    root.setProperty("--tile-text", theme.tileText);
    root.setProperty("--done-tile", theme.doneTile);
    root.setProperty("--done-text", theme.doneText);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.background);
  }, [theme]);
  return <>{children}</>;
}
