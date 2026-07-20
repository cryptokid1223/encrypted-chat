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
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, ciphertext, nonce, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return "Encrypted message";
  }

  const decrypted = await decryptMessageRow(
    data as EncryptedMessageRow,
    theirPublicKey,
    myPrivateKey,
  );
  return messagePreviewText(decrypted.body);
}

export async function previewFromMessageRow(
  row: EncryptedMessageRow,
  theirPublicKey: string,
  myPrivateKey: string,
): Promise<string> {
  const decrypted = await decryptMessageRow(row, theirPublicKey, myPrivateKey);
  return messagePreviewText(decrypted.body);
}
