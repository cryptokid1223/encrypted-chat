import { decryptMessage } from "@/lib/crypto";

export type EncryptedMessageRow = {
  id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  edit_of?: string | null;
};

export type DecryptedMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  editOf?: string | null;
  edited?: boolean;
  editAppliedAt?: string;
};

/** Decrypted plaintext cache — keyed by message id, survives re-renders. */
const decryptedById = new Map<string, string>();

export function getCachedBody(messageId: string): string | undefined {
  return decryptedById.get(messageId);
}

export function cacheBody(messageId: string, body: string): void {
  decryptedById.set(messageId, body);
}

/** When an optimistic id is replaced by the server id, move the cache entry. */
export function promoteCachedId(oldId: string, newId: string): void {
  const body = decryptedById.get(oldId);
  if (body !== undefined) {
    decryptedById.set(newId, body);
    decryptedById.delete(oldId);
  }
}

export function clearDecryptCacheForConversation(): void {
  decryptedById.clear();
}

/**
 * Decrypt exactly once per message id — subsequent calls read from cache.
 */
export async function decryptMessageRow(
  row: EncryptedMessageRow,
  theirPublicKey: string,
  myPrivateKey: string,
): Promise<DecryptedMessage> {
  const cached = decryptedById.get(row.id);
  if (cached !== undefined) {
    return {
      id: row.id,
      senderId: row.sender_id,
      body: cached,
      createdAt: row.created_at,
      editOf: row.edit_of ?? null,
    };
  }

  try {
    const body = await decryptMessage(
      row.ciphertext,
      row.nonce,
      theirPublicKey,
      myPrivateKey,
    );
    decryptedById.set(row.id, body);
    return {
      id: row.id,
      senderId: row.sender_id,
      body,
      createdAt: row.created_at,
      editOf: row.edit_of ?? null,
    };
  } catch {
    const body = "[unable to decrypt]";
    decryptedById.set(row.id, body);
    return {
      id: row.id,
      senderId: row.sender_id,
      body,
      createdAt: row.created_at,
      editOf: row.edit_of ?? null,
    };
  }
}

/** Batch-decrypt the initial history before first paint of the list. */
export async function decryptMessageBatch(
  rows: EncryptedMessageRow[],
  theirPublicKey: string,
  myPrivateKey: string,
): Promise<DecryptedMessage[]> {
  return Promise.all(
    rows.map((row) => decryptMessageRow(row, theirPublicKey, myPrivateKey)),
  );
}
