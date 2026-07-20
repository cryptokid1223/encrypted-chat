import { decryptMessage } from "@/lib/crypto";
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
};

export type DecryptedGroupMessage = {
  id: string;
  messageUuid: string;
  senderId: string;
  body: string;
  createdAt: string;
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
): Promise<{ lastActivity: string; lastPreview: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_messages")
    .select(
      "id, group_id, message_uuid, sender_id, recipient_id, ciphertext, nonce, created_at",
    )
    .eq("group_id", groupId)
    .eq("recipient_id", myUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { lastActivity: fallbackActivity, lastPreview: "No messages yet" };
  }

  const row = data as GroupMessageRow;
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("public_key")
    .eq("id", row.sender_id)
    .maybeSingle();

  const decrypted = await decryptGroupMessageRow(
    row,
    (senderProfile?.public_key as string | null) ?? null,
    myPrivateKey,
  );

  return {
    lastActivity: row.created_at,
    lastPreview:
      decrypted.decryptFailed === true
        ? "Encrypted message"
        : messagePreviewText(decrypted.body),
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
