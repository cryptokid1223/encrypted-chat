"use client";

import { useEffect } from "react";

function resetDocumentScroll() {
  window.scrollTo(0, 0);
}

function scrollInputIntoScrollablePane(target: HTMLElement) {
  let el: HTMLElement | null = target.parentElement;
  while (el && el !== document.documentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    el = el.parentElement;
  }
}

/**
 * Tracks `window.visualViewport.height` and writes it to the CSS variable
 * `--app-height` on `<html>`. When the iOS keyboard opens the visual viewport
 * shrinks, so any container sized with `height: var(--app-height, 100dvh)`
 * will shrink to fit above the keyboard.
 *
 * Also toggles `kb-open` on `<html>` when the keyboard is likely visible.
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
      const height = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);

      const keyboardOpen =
        vv != null && vv.height < window.innerHeight - 100;
      document.documentElement.classList.toggle("kb-open", keyboardOpen);

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

      scrollInputIntoScrollablePane(target);

      for (const id of focusTimeoutIds) clearTimeout(id);
      focusTimeoutIds = [
        setTimeout(resetDocumentScroll, 50),
        setTimeout(resetDocumentScroll, 300),
      ];
    }

    update();

    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", onFocusIn);
      for (const id of focusTimeoutIds) clearTimeout(id);
      document.documentElement.classList.remove("kb-open");
    };
  }, [onResize]);
}
