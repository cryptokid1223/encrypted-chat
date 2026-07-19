/** Consistent participant ordering for conversations unique constraint. */
export function orderedParticipants(
  idA: string,
  idB: string,
): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Sidebar relative time — "6:40 PM" today, else short date. */
export function formatListTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function formatDayDivider(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
      (startToday.getTime() - startMsg.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function isSameCalendarDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Consecutive same-sender messages within 3 minutes form a group. */
export function isSameMessageGroup(
  aSender: string,
  aTime: string,
  bSender: string,
  bTime: string,
): boolean {
  if (aSender !== bSender) return false;
  const diff = Math.abs(new Date(aTime).getTime() - new Date(bTime).getTime());
  return diff <= 3 * 60 * 1000;
}
