import { applyAfterClear } from "@/lib/conversationClear";
import { messagePreviewText } from "@/lib/messageContent";
import {
  decryptMessageRow,
  type EncryptedMessageRow,
} from "@/lib/message-decrypt";
import { createClient } from "@/lib/supabase/client";

export async function fetchConversationPreview(
  conversationId: string,
  theirPublicKey: string,
  myPrivateKey: string,
  clearedAt?: string | null,
): Promise<{ text: string; senderId: string | null; lastActivity: string } | null> {
  const supabase = createClient();
  let query = supabase
    .from("messages")
    .select("id, sender_id, ciphertext, nonce, created_at")
    .eq("conversation_id", conversationId);
  query = applyAfterClear(query, clearedAt ?? undefined);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const decrypted = await decryptMessageRow(
    data as EncryptedMessageRow,
    theirPublicKey,
    myPrivateKey,
  );
  return {
    text: messagePreviewText(decrypted.body),
    senderId: (data.sender_id as string) ?? null,
    lastActivity: data.created_at as string,
  };
}

export async function previewFromMessageRow(
  row: EncryptedMessageRow,
  theirPublicKey: string,
  myPrivateKey: string,
): Promise<string> {
  const decrypted = await decryptMessageRow(row, theirPublicKey, myPrivateKey);
  return messagePreviewText(decrypted.body);
}
