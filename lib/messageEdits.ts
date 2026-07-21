import { parseMessageBody } from "@/lib/messageContent";

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type EditTargetMeta = {
  editOf: string;
  text: string;
};

/** Plaintext envelope for an edit (encrypted like any message body). */
export function buildEditBody(text: string, editOf: string): string {
  return JSON.stringify({ _celesth: "edit", v: 1, text, editOf });
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

export function isEditEnvelope(body: string): boolean {
  return parseMessageBody(body).type === "edit";
}

export function canEditMessage(
  isMine: boolean,
  body: string,
  createdAt: string,
  now = Date.now(),
): boolean {
  if (!isMine) return false;
  if (now - new Date(createdAt).getTime() > EDIT_WINDOW_MS) return false;
  const parsed = parseMessageBody(body);
  return parsed.type === "text";
}

export type MergeableMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  editOf?: string | null;
  edited?: boolean;
  editAppliedAt?: string;
};

function isHiddenByClear(createdAt: string, clearedAt?: string | null): boolean {
  if (!clearedAt) return false;
  return new Date(createdAt).getTime() <= new Date(clearedAt).getTime();
}

/**
 * Fold edit rows into their originals for rendering. Edit rows never appear
 * as standalone bubbles. Edits whose original is not loaded go to pendingEdits.
 */
export function mergeMessagesWithEdits<T extends MergeableMessage>(
  rows: T[],
  clearedAt?: string | null,
): { messages: T[]; pendingEdits: Map<string, T> } {
  const originals = new Map<string, T>();
  const edits: T[] = [];

  for (const row of rows) {
    const meta = editMetaFromMessage(row.body, row.editOf);
    if (meta) {
      edits.push({ ...row, editOf: meta.editOf });
    } else if (!isHiddenByClear(row.createdAt, clearedAt)) {
      originals.set(row.id, { ...row, edited: row.edited ?? false });
    }
  }

  edits.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const pendingEdits = new Map<string, T>();

  for (const edit of edits) {
    const meta = editMetaFromMessage(edit.body, edit.editOf);
    if (!meta) continue;

    const original = originals.get(meta.editOf);
    if (!original) {
      const prior = pendingEdits.get(meta.editOf);
      if (
        !prior ||
        new Date(edit.createdAt).getTime() >
          new Date(prior.createdAt).getTime()
      ) {
        pendingEdits.set(meta.editOf, edit);
      }
      continue;
    }

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

  // Apply pending edits when originals are now present (e.g. after pagination).
  for (const [editOf, edit] of pendingEdits) {
    const original = originals.get(editOf);
    if (!original) continue;

    const meta = editMetaFromMessage(edit.body, edit.editOf);
    if (!meta || edit.senderId !== original.senderId) {
      pendingEdits.delete(editOf);
      continue;
    }

    const appliedAt = original.editAppliedAt;
    if (
      appliedAt &&
      new Date(edit.createdAt).getTime() <= new Date(appliedAt).getTime()
    ) {
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

  const messages = [...originals.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return { messages, pendingEdits };
}

/** Apply a single incoming edit to rendered messages without adding a bubble. */
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

/** Merge a batch of incoming rows into rendered messages (pagination / realtime). */
export function integrateMessageBatch<T extends MergeableMessage>(
  current: T[],
  incoming: T[],
  pendingEdits: Map<string, T>,
  clearedAt?: string | null,
  prepend = false,
): { messages: T[]; pendingEdits: Map<string, T> } {
  const nextPending = new Map(pendingEdits);
  let next = [...current];

  for (const row of incoming) {
    const meta = editMetaFromMessage(row.body, row.editOf);
    if (meta) {
      const applied = applyIncomingEdit(next, { ...row, editOf: meta.editOf }, clearedAt);
      if (applied) {
        next = applied;
        nextPending.delete(meta.editOf);
      } else {
        const prior = nextPending.get(meta.editOf);
        if (
          !prior ||
          new Date(row.createdAt).getTime() > new Date(prior.createdAt).getTime()
        ) {
          nextPending.set(meta.editOf, { ...row, editOf: meta.editOf });
        }
      }
      continue;
    }

    if (isHiddenByClear(row.createdAt, clearedAt)) continue;
    if (next.some((m) => m.id === row.id)) continue;

    next = prepend ? [row, ...next] : [...next, row];
    next.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const pending = nextPending.get(row.id);
    if (pending) {
      const applied = applyIncomingEdit(next, pending, clearedAt);
      if (applied) {
        next = applied;
        nextPending.delete(row.id);
      }
    }
  }

  return { messages: next, pendingEdits: nextPending };
}
