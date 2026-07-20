"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const RESISTANCE = 0.5;
const MAX_PULL = 80;
const THRESHOLD = 60;
const SETTLE_MS = 200;
const MIN_REFRESH_MS = 500;
const TAP_CANCEL_PX = 10;

/** Tailwind `md` — pull-to-refresh is mobile-narrow only. */
const WIDE_VIEWPORT_MQ = "(min-width: 768px)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isKeyboardOpen(): boolean {
  return document.documentElement.classList.contains("kb-open");
}

function isPullRefreshAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia(WIDE_VIEWPORT_MQ).matches;
}

async function waitAtLeast(startedAt: number, minMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed >= minMs) return;
  await new Promise<void>((resolve) =>
    setTimeout(resolve, minMs - elapsed),
  );
}

export type PullToRefreshApi = {
  /** Apply to the scrollable list content wrapper. */
  contentStyle: CSSProperties;
  /** Pixels of rubber-band pull (0 when idle). */
  pullDistance: number;
  refreshing: boolean;
  /**
   * 0–1 progress toward the refresh threshold.
   * Under reduced motion (no translate), tracks finger drag instead.
   */
  progress: number;
};

/**
 * iOS-style pull-to-refresh on a fixed-layout inner scroll pane.
 * Touch-only; inactive on wide viewports and while `html.kb-open`.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
  enabled = true,
): PullToRefreshApi {
  const [pullDistance, setPullDistance] = useState(0);
  const [progress, setProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);

  const pullRef = useRef(0);
  const progressRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const enabledRef = useRef(enabled);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    reduceMotionRef.current = prefersReducedMotion();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      reduceMotionRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setPull = useCallback((next: number, nextProgress: number) => {
    pullRef.current = next;
    progressRef.current = nextProgress;
    setPullDistance(next);
    setProgress(nextProgress);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    let startY = 0;
    let tracking = false;
    let gestureActive = false;
    let maxAbsDy = 0;
    let suppressClick = false;
    let moveListener: ((e: TouchEvent) => void) | null = null;
    let endListener: (() => void) | null = null;

    const detachMoveEnd = () => {
      if (moveListener) {
        el.removeEventListener("touchmove", moveListener);
        moveListener = null;
      }
      if (endListener) {
        el.removeEventListener("touchend", endListener);
        el.removeEventListener("touchcancel", endListener);
        endListener = null;
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    const springBack = () => {
      setSettling(true);
      setPull(0, 0);
      window.setTimeout(
        () => setSettling(false),
        reduceMotionRef.current ? 0 : SETTLE_MS,
      );
    };

    const runRefresh = () => {
      refreshingRef.current = true;
      setRefreshing(true);
      // Animate lock to the 60px threshold, fetch immediately.
      setSettling(true);
      setPull(reduceMotionRef.current ? 0 : THRESHOLD, 1);
      window.setTimeout(
        () => setSettling(false),
        reduceMotionRef.current ? 0 : SETTLE_MS,
      );

      const startedAt = Date.now();
      void (async () => {
        try {
          await onRefreshRef.current();
        } catch {
          // Settle silently — list stays live via Realtime.
        }
        await waitAtLeast(startedAt, MIN_REFRESH_MS);
        setSettling(true);
        setPull(0, 0);
        window.setTimeout(
          () => {
            refreshingRef.current = false;
            setRefreshing(false);
            setSettling(false);
          },
          reduceMotionRef.current ? 0 : SETTLE_MS,
        );
      })();
    };

    const finishGesture = (commitRefresh: boolean) => {
      detachMoveEnd();
      tracking = false;
      gestureActive = false;

      if (maxAbsDy > TAP_CANCEL_PX) {
        suppressClick = true;
      }

      if (commitRefresh && !refreshingRef.current) {
        runRefresh();
        return;
      }

      springBack();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || refreshingRef.current) return;
      if (isKeyboardOpen()) {
        finishGesture(false);
        return;
      }

      const y = e.touches[0]?.clientY ?? startY;
      const dy = y - startY;
      maxAbsDy = Math.max(maxAbsDy, Math.abs(dy));

      if (dy > 0 && el.scrollTop <= 0) {
        gestureActive = true;
        e.preventDefault();
        const resisted = Math.min(MAX_PULL, dy * RESISTANCE);
        const nextProgress = Math.min(1, resisted / THRESHOLD);
        if (reduceMotionRef.current) {
          setPull(0, nextProgress);
        } else {
          setPull(resisted, nextProgress);
        }
        return;
      }

      if (gestureActive) {
        finishGesture(false);
      } else {
        detachMoveEnd();
        tracking = false;
      }
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      const commit = gestureActive && progressRef.current >= 1;
      finishGesture(commit);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      if (!isPullRefreshAllowed()) return;
      if (isKeyboardOpen()) return;
      if (refreshingRef.current) return;
      if (el.scrollTop > 0) return;
      if (e.touches.length !== 1) return;

      startY = e.touches[0].clientY;
      tracking = true;
      gestureActive = false;
      maxAbsDy = 0;
      setSettling(false);

      // Non-passive move/end only for this potential top-of-list gesture.
      detachMoveEnd();
      moveListener = onTouchMove;
      endListener = onTouchEnd;
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd);
      el.addEventListener("touchcancel", onTouchEnd);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("click", onClickCapture, true);
      detachMoveEnd();
    };
  }, [scrollRef, enabled, setPull]);

  const contentStyle: CSSProperties = reduceMotionRef.current
    ? {}
    : {
        transform: `translate3d(0, ${pullDistance}px, 0)`,
        transition: settling ? `transform ${SETTLE_MS}ms ease-out` : "none",
        willChange: pullDistance > 0 || settling ? "transform" : undefined,
      };

  return {
    contentStyle,
    pullDistance,
    refreshing,
    progress: refreshing ? 1 : progress,
  };
}
