/** Newest-first page size for conversation history. */
export const PAGE_SIZE = 50;

/**
 * Extra raw rows for group_messages so message_uuid dedupe after fetch
 * doesn't shrink a page far below PAGE_SIZE.
 */
export const GROUP_FETCH_BUFFER = 10;

export const GROUP_FETCH_LIMIT = PAGE_SIZE + GROUP_FETCH_BUFFER;

export type HistoryCursor = {
  createdAt: string;
  id: string;
};

export type ScrollAnchor = {
  height: number;
  top: number;
};

/** PostgREST `.or()` filter: rows strictly older than (created_at, id). */
export function olderThanOrFilter(
  cursor: HistoryCursor,
  idColumn: "id" | "message_uuid" = "id",
): string {
  const ts = cursor.createdAt.replace(/"/g, '\\"');
  const id = cursor.id.replace(/"/g, '\\"');
  return `created_at.lt."${ts}",and(created_at.eq."${ts}",${idColumn}.lt."${id}")`;
}

export function cursorFromOldestRow(
  row: { created_at: string; id: string } | undefined,
): HistoryCursor | null {
  if (!row) return null;
  return { createdAt: row.created_at, id: row.id };
}

/** Newest-first rows → chronological (oldest → newest) for render/decrypt. */
export function chronologicalAsc<T>(newestFirst: T[]): T[] {
  return [...newestFirst].reverse();
}

/**
 * Dedupe group rows by message_uuid, keeping the first occurrence.
 * Pass newest-first rows so the kept row is the newest copy.
 * Stops once `limit` unique messages are collected.
 */
export function takeUniqueGroupRowsByUuid<
  T extends { message_uuid: string },
>(newestFirst: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of newestFirst) {
    if (seen.has(row.message_uuid)) continue;
    seen.add(row.message_uuid);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function captureScrollAnchor(
  el: HTMLElement | null,
): ScrollAnchor | null {
  if (!el) return null;
  return { height: el.scrollHeight, top: el.scrollTop };
}

export function restoreScrollAnchor(
  el: HTMLElement | null,
  anchor: ScrollAnchor | null,
): void {
  if (!el || !anchor) return;
  el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
}
