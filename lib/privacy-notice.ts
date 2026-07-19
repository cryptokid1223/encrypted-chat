const STORAGE_KEY = "cipher-privacy-notice-dismissed";

export function hasDismissedPrivacyNotice(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPrivacyNotice(): void {
  localStorage.setItem(STORAGE_KEY, "1");
}
