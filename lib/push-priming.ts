const DISMISS_COUNT_KEY = "celesth-push-priming-dismiss-count";
const LAST_DISMISS_KEY = "celesth-push-priming-last-dismiss";
const SESSION_DISMISS_KEY = "celesth-push-priming-session-dismissed";

const MAX_DISMISSALS = 2;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function markPushPrimingDismissedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch {
    // Ignore storage failures.
  }
}

export function recordPushPrimingNotNow(): void {
  markPushPrimingDismissedThisSession();
  try {
    const count = getPushPrimingDismissCount() + 1;
    localStorage.setItem(DISMISS_COUNT_KEY, String(count));
    localStorage.setItem(LAST_DISMISS_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures.
  }
}

export function getPushPrimingDismissCount(): number {
  try {
    const raw = localStorage.getItem(DISMISS_COUNT_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function wasPushPrimingDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Show priming only when OS permission is still 'prompt'. */
export function shouldShowPushPriming(permission: PushPermissionState): boolean {
  if (permission !== "prompt") return false;
  if (wasPushPrimingDismissedThisSession()) return false;
  if (getPushPrimingDismissCount() >= MAX_DISMISSALS) return false;

  try {
    const lastRaw = localStorage.getItem(LAST_DISMISS_KEY);
    if (!lastRaw) return true;
    const last = parseInt(lastRaw, 10);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last >= COOLDOWN_MS;
  } catch {
    return true;
  }
}

export type PushPermissionState = "prompt" | "granted" | "denied" | "unavailable";
