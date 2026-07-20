"use client";

import { useEffect } from "react";

function resetDocumentScroll() {
  window.scrollTo(0, 0);
}

/**
 * Tracks `window.visualViewport.height` and writes it to the CSS variable
 * `--app-height` on `<html>`. When the iOS keyboard opens the visual viewport
 * shrinks, so any container sized with `height: var(--app-height, 100dvh)`
 * will shrink to fit above the keyboard.
 *
 * Also counteracts iOS scroll pushes when the keyboard opens by resetting
 * document scroll offset on viewport changes and input focus.
 *
 * Fires the optional `onResize` callback whenever the viewport height changes
 * (useful for scroll-to-bottom after keyboard open).
 */
export function useVisualViewport(onResize?: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;
    let focusTimeoutIds: ReturnType<typeof setTimeout>[] = [];

    function update() {
      if (vv) {
        document.documentElement.style.setProperty(
          "--app-height",
          `${vv.height}px`,
        );
      }
      resetDocumentScroll();
      onResize?.();
    }

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        return;
      }

      for (const id of focusTimeoutIds) clearTimeout(id);
      focusTimeoutIds = [
        setTimeout(resetDocumentScroll, 50),
        setTimeout(resetDocumentScroll, 300),
      ];
    }

    update();

    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      for (const id of focusTimeoutIds) clearTimeout(id);
    };
  }, [onResize]);
}
