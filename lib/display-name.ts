export type ContactIdentity = {
  username: string;
  nickname?: string | null;
};

/** @username formatting — usernames are stored without the @ prefix. */
export function formatAtUsername(username: string): string {
  const clean = username.trim();
  if (!clean) return "@unknown";
  return clean.startsWith("@") ? clean : `@${clean}`;
}

export function hasNickname(contact: ContactIdentity): boolean {
  return Boolean(contact.nickname?.trim());
}

/**
 * Primary display label for a contact.
 * Nickname if set, otherwise @username.
 */
export function displayName(contact: ContactIdentity): string {
  const nick = contact.nickname?.trim();
  if (nick) return nick;
  return formatAtUsername(contact.username);
}

/**
 * Match a contact against a search query (username or nickname).
 * Username matching is always against the raw @username identifier.
 */
export function contactMatchesQuery(
  contact: ContactIdentity,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const username = contact.username.toLowerCase();
  const atUsername = formatAtUsername(username).toLowerCase();
  const nick = contact.nickname?.trim().toLowerCase() ?? "";

  return (
    username.includes(q) ||
    atUsername.includes(q) ||
    (nick.length > 0 && nick.includes(q))
  );
}
