"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const STABILITY_MS = 150;
const HARD_TIMEOUT_MS = 1000;
const FADE_MS = 100;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useConversationAnchoring(conversationKey: string, ready: boolean) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isAnchoringRef = useRef(true);
  const anchoringGenerationRef = useRef(0);

  const [paneOpacity, setPaneOpacity] = useState(0);

  const scrollToBottomInstant = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (isAnchoringRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return true;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining < 180;
  }, []);

  useEffect(() => {
    anchoringGenerationRef.current += 1;
    isAnchoringRef.current = true;
    setPaneOpacity(0);
    scrollToBottomInstant();
  }, [conversationKey, scrollToBottomInstant]);

  useEffect(() => {
    if (!ready) return;

    const generation = ++anchoringGenerationRef.current;
    isAnchoringRef.current = true;
    setPaneOpacity(0);

    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    let ended = false;
    let observer: ResizeObserver | null = null;

    const endAnchoring = () => {
      if (ended || generation !== anchoringGenerationRef.current) return;
      ended = true;

      if (stabilityTimer) clearTimeout(stabilityTimer);
      if (hardTimeout) clearTimeout(hardTimeout);
      observer?.disconnect();

      scrollToBottomInstant();
      isAnchoringRef.current = false;

      if (prefersReducedMotion()) {
        setPaneOpacity(1);
        return;
      }

      requestAnimationFrame(() => {
        setPaneOpacity(1);
      });
    };

    const onResize = () => {
      if (ended || generation !== anchoringGenerationRef.current) return;
      scrollToBottomInstant();
      if (stabilityTimer) clearTimeout(stabilityTimer);
      stabilityTimer = setTimeout(endAnchoring, STABILITY_MS);
    };

    const start = () => {
      const content = contentRef.current;
      scrollToBottomInstant();

      if (content) {
        observer = new ResizeObserver(onResize);
        observer.observe(content);
      }

      stabilityTimer = setTimeout(endAnchoring, STABILITY_MS);
      hardTimeout = setTimeout(endAnchoring, HARD_TIMEOUT_MS);
    };

    const frame = requestAnimationFrame(start);

    return () => {
      cancelAnimationFrame(frame);
      if (stabilityTimer) clearTimeout(stabilityTimer);
      if (hardTimeout) clearTimeout(hardTimeout);
      observer?.disconnect();
    };
  }, [conversationKey, ready, scrollToBottomInstant]);

  const reducedMotionRef = useRef(false);
  useEffect(() => {
    reducedMotionRef.current = prefersReducedMotion();
  }, []);

  const paneStyle: CSSProperties = {
    opacity: paneOpacity,
    transition: reducedMotionRef.current
      ? undefined
      : `opacity ${FADE_MS}ms ease`,
  };

  return {
    scrollerRef,
    contentRef,
    paneStyle,
    isAnchoringRef,
    scrollToBottom,
    isNearBottom,
  };
}
