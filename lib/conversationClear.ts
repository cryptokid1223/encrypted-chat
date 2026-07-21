import type { ConversationKind } from "@/lib/readState";
import { unreadMapKey } from "@/lib/readState";
import { createClient } from "@/lib/supabase/client";

export type ConversationClearsMap = Map<string, string>;

type ClearFilterableQuery = {
  gt(column: string, value: string): ClearFilterableQuery;
};

/** PostgREST helper: only rows strictly after cleared_at (no-op when unset). */
export function applyAfterClear<T extends ClearFilterableQuery>(
  query: T,
  clearedAt: string | null | undefined,
): T {
  if (!clearedAt) return query;
  return query.gt("created_at", clearedAt) as T;
}

export function isVisibleInInbox(
  lastActivity: string,
  clearedAt: string | null | undefined,
): boolean {
  if (!clearedAt) return true;
  return new Date(lastActivity).getTime() > new Date(clearedAt).getTime();
}

/** Fetch all clear cursors for the signed-in user. */
export async function fetchConversationClearsMap(): Promise<ConversationClearsMap> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();

  const { data, error } = await supabase
    .from("conversation_clears")
    .select("conversation_type, conversation_id, cleared_at")
    .eq("user_id", user.id);

  if (error) {
    console.warn("[conversationClear] fetch failed:", error.message);
    return new Map();
  }

  const map: ConversationClearsMap = new Map();
  for (const row of data ?? []) {
    const kind = row.conversation_type as ConversationKind;
    if (kind !== "dm" && kind !== "group") continue;
    map.set(
      unreadMapKey(kind, row.conversation_id as string),
      row.cleared_at as string,
    );
  }
  return map;
}

/** Upsert cleared_at = now() for this conversation (per-user hide). */
export async function markConversationCleared(
  kind: ConversationKind,
  conversationId: string,
): Promise<{ ok: true; clearedAt: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const clearedAt = new Date().toISOString();
  const { error } = await supabase.from("conversation_clears").upsert(
    {
      user_id: user.id,
      conversation_type: kind,
      conversation_id: conversationId,
      cleared_at: clearedAt,
    },
    { onConflict: "user_id,conversation_type,conversation_id" },
  );

  if (error) {
    return { ok: false, error: "Could not delete conversation." };
  }
  return { ok: true, clearedAt };
}

export function clearedAtFor(
  map: ConversationClearsMap,
  kind: ConversationKind,
  conversationId: string,
): string | undefined {
  return map.get(unreadMapKey(kind, conversationId));
}

export async function fetchClearedAt(
  kind: ConversationKind,
  conversationId: string,
): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("conversation_clears")
    .select("cleared_at")
    .eq("user_id", user.id)
    .eq("conversation_type", kind)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error || !data) return null;
  return (data.cleared_at as string) ?? null;
}

export function attachmentCacheScope(
  kind: ConversationKind,
  conversationId: string,
): string {
  return `${kind}:${conversationId}`;
}
