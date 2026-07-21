import { createClient } from "@/lib/supabase/client";

export type MessageHidesSet = Set<string>;

/** Fetch message uuids hidden via delete-for-me in this conversation. */
export async function fetchMessageHides(
  conversationId: string,
): Promise<MessageHidesSet> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from("message_hides")
    .select("message_uuid")
    .eq("user_id", user.id)
    .eq("conversation_id", conversationId);

  if (error) {
    console.warn("[messageHide] fetch failed:", error.message);
    return new Set();
  }

  return new Set(
    (data ?? [])
      .map((row) => row.message_uuid as string)
      .filter(Boolean),
  );
}

/** Hide a single message for the signed-in user (delete-for-me). */
export async function markMessageHidden(
  messageUuid: string,
  conversationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { error } = await supabase.from("message_hides").upsert(
    {
      user_id: user.id,
      message_uuid: messageUuid,
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,message_uuid" },
  );

  if (error) {
    return { ok: false, error: "Could not hide message." };
  }
  return { ok: true };
}
