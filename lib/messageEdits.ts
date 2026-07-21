import type { AttachmentMeta } from "@/lib/fileCrypto";
import { parseMessageBody } from "@/lib/messageContent";
import { purgeAttachmentPaths } from "@/lib/attachmentCache";
import { deleteEncryptedAttachment } from "@/lib/attachmentStorage";

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DELETE_FOR_EVERYONE_WINDOW_MS = EDIT_WINDOW_MS;

export type EditTargetMeta = {
  editOf: string;
  text: string;
};

export type DeleteTargetMeta = {
  deleteOf: string;
};

/** Plaintext envelope for an edit (encrypted like any message body). */
export function buildEditBody(text: string, editOf: string): string {
  return JSON.stringify({ _celesth: "edit", v: 1, text, editOf });
}

/** Plaintext envelope for delete-for-everyone. */
export function buildDeleteEnvelopeBody(deleteOf: string): string {
  return JSON.stringify({ _celesth: "delete", v: 1, deleteOf });
}

/** Extract edit metadata from decrypted body + optional DB edit_of column. */
export function editMetaFromMessage(
  body: string,
  editOfColumn?: string | null,
): EditTargetMeta | null {
  const parsed = parseMessageBody(body);
  if (parsed.type === "edit") {
    return { editOf: parsed.editOf, text: parsed.text };
  }
  if (editOfColumn) {
    if (parsed.type === "text") {
      return { editOf: editOfColumn, text: parsed.text };
    }
    return null;
  }
  return null;
}

/** Extract delete metadata from decrypted body + optional DB delete_of column. */
export function deleteMetaFromMessage(
  body: string,
  deleteOfColumn?: string | null,
): DeleteTargetMeta | null {
  const parsed = parseMessageBody(body);
  if (parsed.type === "delete") {
    return { deleteOf: parsed.deleteOf };
  }
  if (deleteOfColumn) {
    return { deleteOf: deleteOfColumn };
  }
  return null;
}

export function isEditEnvelope(body: string): boolean {
  return parseMessageBody(body).type === "edit";
}

export function isDeleteEnvelope(body: string): boolean {
  return parseMessageBody(body).type === "delete";
}

export function canEditMessage(
  isMine: boolean,
  body: string,
  createdAt: string,
  deleted?: boolean,
  now = Date.now(),
): boolean {
  if (!isMine || deleted) return false;
  if (now - new Date(createdAt).getTime() > EDIT_WINDOW_MS) return false;
  const parsed = parseMessageBody(body);
  return parsed.type === "text";
}

export function canDeleteForEveryone(
  isMine: boolean,
  createdAt: string,
  deleted?: boolean,
  now = Date.now(),
): boolean {
  if (!isMine || deleted) return false;
  return now - new Date(createdAt).getTime() <= DELETE_FOR_EVERYONE_WINDOW_MS;
}

export type MergeableMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  editOf?: string | null;
  deleteOf?: string | null;
  edited?: boolean;
  deleted?: boolean;
  editAppliedAt?: string;
  deleteAppliedAt?: string;
};

export type PendingMutations<T extends MergeableMessage> = {
  pendingEdits: Map<string, T>;
  pendingDeletes: Map<string, T>;
};

function isHiddenByClear(createdAt: string, clearedAt?: string | null): boolean {
  if (!clearedAt) return false;
  return new Date(createdAt).getTime() <= new Date(clearedAt).getTime();
}

function attachmentPathsFromBody(body: string): string[] {
  const parsed = parseMessageBody(body);
  if (parsed.type !== "attachment") return [];
  const paths = [parsed.meta.path];
  if (parsed.meta.thumb?.path) paths.push(parsed.meta.thumb.path);
  return paths.filter(Boolean);
}

/** Purge decrypt cache (+ optional storage) for attachment bodies. */
export function purgeAttachmentsForBody(
  body: string,
  options?: { deleteFromStorage?: boolean; cacheScope?: string },
): void {
  const parsed = parseMessageBody(body);
  if (parsed.type !== "attachment") return;
  const meta = parsed.meta;
  purgeAttachmentPaths(collectAttachmentPaths(meta));
  if (options?.deleteFromStorage) {
    void deleteEncryptedAttachment(meta.path);
    if (meta.thumb?.path) void deleteEncryptedAttachment(meta.thumb.path);
  }
}

export function collectAttachmentPaths(meta: AttachmentMeta): string[] {
  const paths = [meta.path];
  if (meta.thumb?.path) paths.push(meta.thumb.path);
  return paths.filter(Boolean);
}

function filterHidden<T extends MergeableMessage>(
  messages: T[],
  hiddenIds?: Set<string>,
): T[] {
  if (!hiddenIds?.size) return messages;
  return messages.filter((m) => !hiddenIds.has(m.id));
}

function applyDeleteToOriginal<T extends MergeableMessage>(
  original: T,
  del: T,
): T {
  return {
    ...original,
    deleted: true,
    edited: false,
    deleteAppliedAt: del.createdAt,
    body: original.body,
  };
}

/**
 * Fold edit/delete rows into originals. Mutation rows never render as bubbles.
 * Deletes are terminal and beat any edits.
 */
export function mergeMessagesWithEdits<T extends MergeableMessage>(
  rows: T[],
  clearedAt?: string | null,
  hiddenIds?: Set<string>,
): { messages: T[]; pendingEdits: Map<string, T>; pendingDeletes: Map<string, T> } {
  const originals = new Map<string, T>();
  const edits: T[] = [];
  const deletes: T[] = [];

  for (const row of rows) {
    const deleteMeta = deleteMetaFromMessage(row.body, row.deleteOf);
    if (deleteMeta) {
      deletes.push({ ...row, deleteOf: deleteMeta.deleteOf });
      continue;
    }
    const editMeta = editMetaFromMessage(row.body, row.editOf);
    if (editMeta) {
      edits.push({ ...row, editOf: editMeta.editOf });
      continue;
    }
    if (!isHiddenByClear(row.createdAt, clearedAt)) {
      originals.set(row.id, {
        ...row,
        edited: row.edited ?? false,
        deleted: row.deleted ?? false,
      });
    }
  }

  const pendingEdits = new Map<string, T>();
  const pendingDeletes = new Map<string, T>();

  const sortedDeletes = [...deletes].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const sortedEdits = [...edits].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const del of sortedDeletes) {
    const meta = deleteMetaFromMessage(del.body, del.deleteOf);
    if (!meta) continue;

    const original = originals.get(meta.deleteOf);
    if (!original) {
      const prior = pendingDeletes.get(meta.deleteOf);
      if (
        !prior ||
        new Date(del.createdAt).getTime() > new Date(prior.createdAt).getTime()
      ) {
        pendingDeletes.set(meta.deleteOf, del);
      }
      continue;
    }

    if (del.senderId !== original.senderId) continue;
    if (isHiddenByClear(original.createdAt, clearedAt)) continue;

    originals.set(meta.deleteOf, applyDeleteToOriginal(original, del));
    pendingEdits.delete(meta.deleteOf);
  }

  for (const edit of sortedEdits) {
    const meta = editMetaFromMessage(edit.body, edit.editOf);
    if (!meta) continue;

    const original = originals.get(meta.editOf);
    if (!original) {
      if (pendingDeletes.has(meta.editOf)) continue;
      const prior = pendingEdits.get(meta.editOf);
      if (
        !prior ||
        new Date(edit.createdAt).getTime() > new Date(prior.createdAt).getTime()
      ) {
        pendingEdits.set(meta.editOf, edit);
      }
      continue;
    }

    if (original.deleted) continue;
    if (edit.senderId !== original.senderId) continue;
    if (isHiddenByClear(original.createdAt, clearedAt)) continue;

    const appliedAt = original.editAppliedAt;
    if (
      appliedAt &&
      new Date(edit.createdAt).getTime() <= new Date(appliedAt).getTime()
    ) {
      continue;
    }

    originals.set(meta.editOf, {
      ...original,
      body: meta.text,
      edited: true,
      editAppliedAt: edit.createdAt,
    });
  }

  for (const [editOf, edit] of pendingEdits) {
    const original = originals.get(editOf);
    if (!original || original.deleted) {
      continue;
    }

    const meta = editMetaFromMessage(edit.body, edit.editOf);
    if (!meta || edit.senderId !== original.senderId) {
      pendingEdits.delete(editOf);
      continue;
    }

    originals.set(editOf, {
      ...original,
      body: meta.text,
      edited: true,
      editAppliedAt: edit.createdAt,
    });
    pendingEdits.delete(editOf);
  }

  for (const [deleteOf, del] of pendingDeletes) {
    const original = originals.get(deleteOf);
    if (!original) continue;

    if (del.senderId !== original.senderId) {
      pendingDeletes.delete(deleteOf);
      continue;
    }

    originals.set(deleteOf, applyDeleteToOriginal(original, del));
    pendingDeletes.delete(deleteOf);
    pendingEdits.delete(deleteOf);
  }

  const messages = filterHidden(
    [...originals.values()].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
    hiddenIds,
  );

  return { messages, pendingEdits, pendingDeletes };
}

/** Apply a single incoming edit without adding a bubble. */
export function applyIncomingEdit<T extends MergeableMessage>(
  messages: T[],
  edit: T,
  clearedAt?: string | null,
): T[] | null {
  const meta = editMetaFromMessage(edit.body, edit.editOf);
  if (!meta) return null;

  const idx = messages.findIndex((m) => m.id === meta.editOf);
  if (idx < 0) return null;

  const original = messages[idx];
  if (original.deleted) return messages;
  if (edit.senderId !== original.senderId) return null;
  if (isHiddenByClear(original.createdAt, clearedAt)) return null;

  const appliedAt = original.editAppliedAt;
  if (
    appliedAt &&
    new Date(edit.createdAt).getTime() <= new Date(appliedAt).getTime()
  ) {
    return messages;
  }

  const next = [...messages];
  next[idx] = {
    ...original,
    body: meta.text,
    edited: true,
    editAppliedAt: edit.createdAt,
  };
  return next;
}

/** Apply a single incoming delete-for-everyone in place. */
export function applyIncomingDelete<T extends MergeableMessage>(
  messages: T[],
  del: T,
  clearedAt?: string | null,
  options?: { purgeAttachments?: boolean; cacheScope?: string },
): T[] | null {
  const meta = deleteMetaFromMessage(del.body, del.deleteOf);
  if (!meta) return null;

  const idx = messages.findIndex((m) => m.id === meta.deleteOf);
  if (idx < 0) return null;

  const original = messages[idx];
  if (original.deleted) return messages;
  if (del.senderId !== original.senderId) return null;
  if (isHiddenByClear(original.createdAt, clearedAt)) return null;

  if (options?.purgeAttachments) {
    purgeAttachmentsForBody(original.body, {
      cacheScope: options.cacheScope,
    });
  }

  const next = [...messages];
  next[idx] = applyDeleteToOriginal(original, del);
  return next;
}

/** Merge incoming rows (pagination / realtime). */
export function integrateMessageBatch<T extends MergeableMessage>(
  current: T[],
  incoming: T[],
  pending: PendingMutations<T>,
  clearedAt?: string | null,
  hiddenIds?: Set<string>,
  prepend = false,
): { messages: T[]; pendingEdits: Map<string, T>; pendingDeletes: Map<string, T> } {
  const combined = prepend
    ? [...incoming, ...current]
    : [...current, ...incoming];
  for (const edit of pending.pendingEdits.values()) {
    combined.push(edit);
  }
  for (const del of pending.pendingDeletes.values()) {
    combined.push(del);
  }

  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const row of combined) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }

  return mergeMessagesWithEdits(deduped, clearedAt, hiddenIds);
}

/** Remove a message from the list (delete-for-me). */
export function removeMessageById<T extends { id: string }>(
  messages: T[],
  messageId: string,
): T[] {
  return messages.filter((m) => m.id !== messageId);
}

/** Collect attachment paths from a message body (for sender storage delete). */
export function attachmentPathsForMessageBody(body: string): string[] {
  return attachmentPathsFromBody(body);
}
