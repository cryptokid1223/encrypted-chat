"use client";

import { useEffect } from "react";
import {
  flushMarkConversationRead,
  markConversationRead,
  type ConversationKind,
} from "@/lib/readState";

/**
 * Marks a conversation read when it becomes ready, when the tab returns
 * to the foreground while open, and flushes any debounced write on unmount.
 * Call `markConversationRead(kind, id)` from realtime handlers for
 * incoming messages while open + visible.
 */
export function useMarkConversationRead(
  kind: ConversationKind,
  conversationId: string,
  ready: boolean,
): void {
  useEffect(() => {
    if (!ready || !conversationId) return;

    markConversationRead(kind, conversationId, { immediate: true });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        markConversationRead(kind, conversationId, { immediate: true });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      flushMarkConversationRead(kind, conversationId);
    };
  }, [kind, conversationId, ready]);
}

/** Mark read for an incoming message while the room is open, if visible. */
export function markReadIfVisible(
  kind: ConversationKind,
  conversationId: string,
): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;
  markConversationRead(kind, conversationId);
}
