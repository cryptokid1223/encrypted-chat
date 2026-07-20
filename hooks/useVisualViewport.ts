"use client";

import { useEffect } from "react";

/**
 * Tracks `window.visualViewport.height` and writes it to the CSS variable
 * `--app-height` on `<html>`. When the iOS keyboard opens the visual viewport
 * shrinks, so any container sized with `height: var(--app-height, 100dvh)`
 * will shrink to fit above the keyboard.
 *
 * Fires the optional `onResize` callback whenever the viewport height changes
 * (useful for scroll-to-bottom after keyboard open).
 */
export function useVisualViewport(onResize?: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const h = vv!.height;
      document.documentElement.style.setProperty("--app-height", `${h}px`);
      onResize?.();
    }

    update();

    vv.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
    };
  }, [onResize]);
}
