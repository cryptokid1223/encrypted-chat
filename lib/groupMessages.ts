import { decryptMessage } from "@/lib/crypto";
import { applyAfterClear } from "@/lib/conversationClear";
import { messagePreviewText } from "@/lib/messageContent";
import { cacheBody, getCachedBody } from "@/lib/message-decrypt";
import { createClient } from "@/lib/supabase/client";

export type GroupMessageRow = {
  id: string;
  group_id: string;
  message_uuid: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  edit_of?: string | null;
};

export type DecryptedGroupMessage = {
  id: string;
  messageUuid: string;
  senderId: string;
  body: string;
  createdAt: string;
  editOf?: string | null;
  edited?: boolean;
  editAppliedAt?: string;
  decryptFailed?: boolean;
};

function groupCacheKey(rowId: string): string {
  return `g:${rowId}`;
}

export async function decryptGroupMessageRow(
  row: GroupMessageRow,
  senderPublicKey: string | null | undefined,
  myPrivateKey: string,
): Promise<DecryptedGroupMessage> {
  const cacheId = groupCacheKey(row.id);
  const cached = getCachedBody(cacheId);
  if (cached !== undefined) {
    return {
      id: row.message_uuid,
      messageUuid: row.message_uuid,
      senderId: row.sender_id,
      body: cached,
      createdAt: row.created_at,
      editOf: row.edit_of ?? null,
      decryptFailed: cached === "[unable to decrypt]",
    };
  }

  if (!senderPublicKey?.trim()) {
    const body = "[unable to decrypt]";
    cacheBody(cacheId, body);
    return {
      id: row.message_uuid,
      messageUuid: row.message_uuid,
      senderId: row.sender_id,
      body,
      createdAt: row.created_at,
      decryptFailed: true,
    };
  }

  try {
    const body = await decryptMessage(
      row.ciphertext,
      row.nonce,
      senderPublicKey,
      myPrivateKey,
    );
    cacheBody(cacheId, body);
    return {
      id: row.message_uuid,
      messageUuid: row.message_uuid,
      senderId: row.sender_id,
      body,
      createdAt: row.created_at,
      editOf: row.edit_of ?? null,
    };
  } catch {
    const body = "[unable to decrypt]";
    cacheBody(cacheId, body);
    return {
      id: row.message_uuid,
      messageUuid: row.message_uuid,
      senderId: row.sender_id,
      body,
      createdAt: row.created_at,
      editOf: row.edit_of ?? null,
      decryptFailed: true,
    };
  }
}

export async function decryptGroupMessageBatch(
  rows: GroupMessageRow[],
  senderPublicKeyByUserId: Map<string, string>,
  myPrivateKey: string,
): Promise<DecryptedGroupMessage[]> {
  const byUuid = new Map<string, DecryptedGroupMessage>();
  for (const row of rows) {
    if (byUuid.has(row.message_uuid)) continue;
    const decrypted = await decryptGroupMessageRow(
      row,
      senderPublicKeyByUserId.get(row.sender_id),
      myPrivateKey,
    );
    byUuid.set(row.message_uuid, decrypted);
  }
  return [...byUuid.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export async function fetchGroupPreview(
  groupId: string,
  myUserId: string,
  myPrivateKey: string,
  fallbackActivity: string,
  clearedAt?: string | null,
): Promise<{
  lastActivity: string;
  lastPreview: string;
  lastSenderId: string | null;
  lastSenderUsername: string | null;
  lastMessageId: string;
} | null> {
  const supabase = createClient();
  let baseQuery = supabase
    .from("group_messages")
    .select(
      "id, group_id, message_uuid, sender_id, recipient_id, ciphertext, nonce, created_at, edit_of",
    )
    .eq("group_id", groupId)
    .eq("recipient_id", myUserId)
    .is("edit_of", null);
  baseQuery = applyAfterClear(baseQuery, clearedAt ?? undefined);
  const { data: base, error: baseError } = await baseQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (baseError || !base) {
    return null;
  }

  const baseRow = base as GroupMessageRow;
  const { data: latestEdit } = await supabase
    .from("group_messages")
    .select(
      "id, group_id, message_uuid, sender_id, recipient_id, ciphertext, nonce, created_at, edit_of",
    )
    .eq("group_id", groupId)
    .eq("recipient_id", myUserId)
    .eq("edit_of", baseRow.message_uuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previewRow = (latestEdit ?? base) as GroupMessageRow;
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("public_key, username")
    .eq("id", previewRow.sender_id)
    .maybeSingle();

  const decrypted = await decryptGroupMessageRow(
    previewRow,
    (senderProfile?.public_key as string | null) ?? null,
    myPrivateKey,
  );

  return {
    lastActivity: baseRow.created_at,
    lastPreview:
      decrypted.decryptFailed === true
        ? "Encrypted message"
        : messagePreviewText(decrypted.body),
    lastSenderId: baseRow.sender_id,
    lastSenderUsername: (senderProfile?.username as string | null) ?? null,
    lastMessageId: baseRow.message_uuid,
  };
}

export async function previewFromGroupMessageRow(
  row: GroupMessageRow,
  senderPublicKey: string | null | undefined,
  myPrivateKey: string,
): Promise<string> {
  const decrypted = await decryptGroupMessageRow(
    row,
    senderPublicKey,
    myPrivateKey,
  );
  if (decrypted.decryptFailed) {
    return "Encrypted message";
  }
  return messagePreviewText(decrypted.body);
}
