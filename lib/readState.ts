import { createClient } from "@/lib/supabase/client";

export type ConversationKind = "dm" | "group";

export type UnreadCountRow = {
  conversationType: ConversationKind;
  conversationId: string;
  unreadCount: number;
};

const DEBOUNCE_MS = 2000;

type Pending = {
  timer: ReturnType<typeof setTimeout>;
  kind: ConversationKind;
  conversationId: string;
};

const pendingByKey = new Map<string, Pending>();

function keyFor(kind: ConversationKind, conversationId: string): string {
  return `${kind}:${conversationId}`;
}

async function upsertReadState(
  kind: ConversationKind,
  conversationId: string,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("read_states").upsert(
    {
      user_id: user.id,
      conversation_type: kind,
      conversation_id: conversationId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_type,conversation_id" },
  );

  if (error) {
    console.warn("[readState] upsert failed:", error.message);
  }
}

function clearPending(key: string): void {
  const pending = pendingByKey.get(key);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingByKey.delete(key);
}

/**
 * Upsert last_read_at = now() for the current user.
 * Debounced (trailing, 2s) so rapid incoming messages while viewing
 * coalesce to a single write. Pass `{ immediate: true }` on open /
 * foreground to flush now (still cancels any pending debounce).
 */
export function markConversationRead(
  kind: ConversationKind,
  conversationId: string,
  options?: { immediate?: boolean },
): void {
  if (!conversationId) return;
  const key = keyFor(kind, conversationId);

  if (options?.immediate) {
    clearPending(key);
    void upsertReadState(kind, conversationId);
    return;
  }

  clearPending(key);
  const timer = setTimeout(() => {
    pendingByKey.delete(key);
    void upsertReadState(kind, conversationId);
  }, DEBOUNCE_MS);
  pendingByKey.set(key, { timer, kind, conversationId });
}

/** Flush a pending debounced write immediately (e.g. on unmount). */
export function flushMarkConversationRead(
  kind: ConversationKind,
  conversationId: string,
): void {
  if (!conversationId) return;
  const key = keyFor(kind, conversationId);
  const pending = pendingByKey.get(key);
  if (!pending) return;
  clearPending(key);
  void upsertReadState(kind, conversationId);
}

type RpcUnreadRow = {
  conversation_type: string;
  conversation_id: string;
  unread_count: number | string;
};

/** One round-trip: unread counts for all of my DMs and groups. */
export async function fetchUnreadCounts(): Promise<UnreadCountRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_my_unread_counts");

  if (error) {
    console.warn("[readState] get_my_unread_counts failed:", error.message);
    return [];
  }

  return ((data ?? []) as RpcUnreadRow[])
    .filter(
      (row) =>
        row.conversation_type === "dm" || row.conversation_type === "group",
    )
    .map((row) => ({
      conversationType: row.conversation_type as ConversationKind,
      conversationId: row.conversation_id,
      unreadCount: Number(row.unread_count) || 0,
    }));
}

/** Map helper: "dm:uuid" / "group:uuid" → count. */
export function unreadCountMapFromRows(
  rows: UnreadCountRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(keyFor(row.conversationType, row.conversationId), row.unreadCount);
  }
  return map;
}

export function unreadMapKey(
  kind: ConversationKind,
  conversationId: string,
): string {
  return keyFor(kind, conversationId);
}
