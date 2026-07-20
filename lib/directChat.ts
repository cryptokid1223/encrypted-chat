import { orderedParticipants } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";

/** Find an existing 1:1 conversation or create one. Returns conversation id. */
export async function findOrCreateDirectConversation(
  myUserId: string,
  otherUserId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const [participant_a, participant_b] = orderedParticipants(
    myUserId,
    otherUserId,
  );

  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_a", participant_a)
    .eq("participant_b", participant_b)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: "Could not open conversation." };
  }

  if (existing) {
    return { ok: true, conversationId: existing.id as string };
  }

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({ participant_a, participant_b })
    .select("id")
    .single();

  if (createError || !created) {
    const { data: raced } = await supabase
      .from("conversations")
      .select("id")
      .eq("participant_a", participant_a)
      .eq("participant_b", participant_b)
      .maybeSingle();

    if (raced) {
      return { ok: true, conversationId: raced.id as string };
    }

    return { ok: false, error: "Could not create conversation." };
  }

  return { ok: true, conversationId: created.id as string };
}
