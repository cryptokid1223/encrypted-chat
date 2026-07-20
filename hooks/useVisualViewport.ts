"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import type { PluginListenerHandle } from "@capacitor/core";

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

function applyAppHeight(height: number, keyboardOpen: boolean) {
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  document.documentElement.classList.toggle("kb-open", keyboardOpen);
}

const resizeSubscribers = new Set<() => void>();
let listenerRefCount = 0;
let teardownGlobal: (() => void) | null = null;

function notifyResize() {
  resetDocumentScroll();
  for (const subscriber of resizeSubscribers) {
    subscriber();
  }
}

function setupWebListeners(): () => void {
  const vv = window.visualViewport;
  let focusTimeoutIds: ReturnType<typeof setTimeout>[] = [];

  function update() {
    const height = vv?.height ?? window.innerHeight;
    const keyboardOpen =
      vv != null && vv.height < window.innerHeight - 100;
    applyAppHeight(height, keyboardOpen);
    notifyResize();
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

  applyAppHeight(vv?.height ?? window.innerHeight, false);
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
}

function setupNativeListeners(): () => void {
  let keyboardOpen = false;
  let cancelled = false;
  let showHandle: PluginListenerHandle | null = null;
  let hideHandle: PluginListenerHandle | null = null;
  let focusTimeoutIds: ReturnType<typeof setTimeout>[] = [];

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

  function onWindowResize() {
    if (!keyboardOpen) {
      applyAppHeight(window.innerHeight, false);
      notifyResize();
    }
  }

  applyAppHeight(window.innerHeight, false);

  void (async () => {
    showHandle = await Keyboard.addListener("keyboardWillShow", (info) => {
      keyboardOpen = true;
      applyAppHeight(window.innerHeight - info.keyboardHeight, true);
      notifyResize();
    });

    if (cancelled) {
      showHandle.remove();
      return;
    }

    hideHandle = await Keyboard.addListener("keyboardWillHide", () => {
      keyboardOpen = false;
      applyAppHeight(window.innerHeight, false);
      notifyResize();
    });

    if (cancelled) {
      hideHandle.remove();
    }
  })();

  window.addEventListener("resize", onWindowResize);
  document.addEventListener("focusin", onFocusIn);

  return () => {
    cancelled = true;
    window.removeEventListener("resize", onWindowResize);
    document.removeEventListener("focusin", onFocusIn);
    showHandle?.remove();
    hideHandle?.remove();
    for (const id of focusTimeoutIds) clearTimeout(id);
    document.documentElement.classList.remove("kb-open");
  };
}

function ensureGlobalListeners() {
  if (listenerRefCount === 1 && !teardownGlobal) {
    teardownGlobal = Capacitor.isNativePlatform()
      ? setupNativeListeners()
      : setupWebListeners();
  }
}

function releaseGlobalListeners() {
  if (listenerRefCount === 0 && teardownGlobal) {
    teardownGlobal();
    teardownGlobal = null;
  }
}

/**
 * Tracks available app height and writes it to `--app-height` on `<html>`.
 *
 * - Native (Capacitor): uses `@capacitor/keyboard` show/hide events because
 *   WKWebView's visualViewport does not shrink with `resize: 'none'`.
 * - Web: uses `window.visualViewport` resize/scroll events.
 *
 * Also toggles `kb-open` on `<html>` when the keyboard is likely visible.
 *
 * Fires the optional `onResize` callback whenever the app height changes
 * (useful for scroll-to-bottom after keyboard open).
 */
export function useVisualViewport(onResize?: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (onResize) {
      resizeSubscribers.add(onResize);
    }

    listenerRefCount += 1;
    ensureGlobalListeners();

    return () => {
      if (onResize) {
        resizeSubscribers.delete(onResize);
      }
      listenerRefCount -= 1;
      releaseGlobalListeners();
    };
  }, [onResize]);
}
