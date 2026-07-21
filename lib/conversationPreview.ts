import { applyAfterClear } from "@/lib/conversationClear";
import {
  DELETED_PREVIEW_TEXT,
  messagePreviewText,
} from "@/lib/messageContent";
import { deleteMetaFromMessage } from "@/lib/messageEdits";
import {
  decryptMessageRow,
  type EncryptedMessageRow,
} from "@/lib/message-decrypt";
import { createClient } from "@/lib/supabase/client";

const PREVIEW_SELECT =
  "id, sender_id, ciphertext, nonce, created_at, edit_of, delete_of";

export async function fetchConversationPreview(
  conversationId: string,
  theirPublicKey: string,
  myPrivateKey: string,
  clearedAt?: string | null,
): Promise<{
  text: string;
  senderId: string | null;
  lastActivity: string;
  lastMessageId: string;
  deleted?: boolean;
} | null> {
  const supabase = createClient();
  let baseQuery = supabase
    .from("messages")
    .select(PREVIEW_SELECT)
    .eq("conversation_id", conversationId)
    .is("edit_of", null)
    .is("delete_of", null);
  baseQuery = applyAfterClear(baseQuery, clearedAt ?? undefined);
  const { data: base, error: baseError } = await baseQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (baseError || !base) {
    return null;
  }

  const baseRow = base as EncryptedMessageRow;

  const { data: latestDelete } = await supabase
    .from("messages")
    .select(PREVIEW_SELECT)
    .eq("conversation_id", conversationId)
    .eq("delete_of", baseRow.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestDelete) {
    return {
      text: DELETED_PREVIEW_TEXT,
      senderId: (baseRow.sender_id as string) ?? null,
      lastActivity: baseRow.created_at as string,
      lastMessageId: baseRow.id as string,
      deleted: true,
    };
  }

  const { data: latestEdit } = await supabase
    .from("messages")
    .select(PREVIEW_SELECT)
    .eq("conversation_id", conversationId)
    .eq("edit_of", baseRow.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previewRow = (latestEdit ?? base) as EncryptedMessageRow;
  const decrypted = await decryptMessageRow(
    previewRow,
    theirPublicKey,
    myPrivateKey,
  );
  return {
    text: messagePreviewText(decrypted.body),
    senderId: (baseRow.sender_id as string) ?? null,
    lastActivity: baseRow.created_at as string,
    lastMessageId: baseRow.id as string,
  };
}

export async function previewFromMessageRow(
  row: EncryptedMessageRow,
  theirPublicKey: string,
  myPrivateKey: string,
): Promise<string> {
  if (row.delete_of) {
    return DELETED_PREVIEW_TEXT;
  }
  const decrypted = await decryptMessageRow(row, theirPublicKey, myPrivateKey);
  const deleteMeta = deleteMetaFromMessage(decrypted.body, row.delete_of);
  if (deleteMeta) {
    return DELETED_PREVIEW_TEXT;
  }
  return messagePreviewText(decrypted.body);
}
