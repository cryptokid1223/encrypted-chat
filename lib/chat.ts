/** Consistent participant ordering for conversations unique constraint. */
export function orderedParticipants(
  idA: string,
  idB: string,
): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
