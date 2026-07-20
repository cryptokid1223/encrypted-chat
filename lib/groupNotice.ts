export const GROUP_NOTICE_STORAGE_KEY = "celesth_group_notice";

export function setGroupNotice(message: string): void {
  try {
    sessionStorage.setItem(GROUP_NOTICE_STORAGE_KEY, message);
  } catch {
    // Ignore storage failures.
  }
}

export function consumeGroupNotice(): string | null {
  try {
    const message = sessionStorage.getItem(GROUP_NOTICE_STORAGE_KEY);
    if (message) {
      sessionStorage.removeItem(GROUP_NOTICE_STORAGE_KEY);
    }
    return message;
  } catch {
    return null;
  }
}
