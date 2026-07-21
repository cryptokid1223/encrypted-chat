import { Capacitor, registerPlugin } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import type { PushPermissionState } from "@/lib/push-priming";

interface OpenSettingsPlugin {
  openAppSettings(): Promise<void>;
}

const OpenSettings = registerPlugin<OpenSettingsPlugin>("OpenSettings");

const DEVICE_TOKEN_KEY = "celesth-push-device-token";

export type PushNotificationTapPayload = {
  conversationId?: string;
  conversationType?: "dm" | "group";
};

export type PushHandlers = {
  onNotificationTap?: (payload: PushNotificationTapPayload) => void;
};

let listenersReady = false;
let cachedToken: string | null = null;

export function isPushAvailable(): boolean {
  return (
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("PushNotifications")
  );
}

export function getStoredDeviceToken(): string | null {
  if (cachedToken) return cachedToken;
  try {
    const stored = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (stored) cachedToken = stored;
    return stored;
  } catch {
    return null;
  }
}

function rememberDeviceToken(token: string): void {
  cachedToken = token;
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    // Ignore storage failures.
  }
}

async function upsertDeviceToken(
  token: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("device_tokens").upsert(
    {
      user_id: user.id,
      token,
      platform: "ios",
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );

  if (error) {
    console.error("[push] token upsert failed:", error.message);
  }
}

async function setTokenEnabled(token: string, enabled: boolean): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("device_tokens")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("token", token);

  if (error) {
    console.error("[push] token update failed:", error.message);
  }
}

function parseTapPayload(data: unknown): PushNotificationTapPayload {
  if (!data || typeof data !== "object") return {};
  const row = data as Record<string, unknown>;
  const conversationId =
    typeof row.conversationId === "string"
      ? row.conversationId
      : typeof row.conversation_id === "string"
        ? row.conversation_id
        : undefined;
  const conversationType =
    row.conversationType === "group" || row.conversation_type === "group"
      ? "group"
      : row.conversationType === "dm" || row.conversation_type === "dm"
        ? "dm"
        : undefined;
  return { conversationId, conversationType };
}

/** Attach plugin listeners once (iOS only). */
export async function initPushListeners(
  handlers: PushHandlers = {},
): Promise<void> {
  if (!isPushAvailable() || listenersReady) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("registration", (event) => {
    const token = event.value;
    if (!token) return;
    rememberDeviceToken(token);
    void upsertDeviceToken(token, true);
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.error("[push] registration error:", error);
  });

  await PushNotifications.addListener("pushNotificationReceived", () => {
    // Foreground: rely on Realtime UI; no system banner.
  });

  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const payload = parseTapPayload(action.notification.data);
      handlers.onNotificationTap?.(payload);
    },
  );

  listenersReady = true;
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!isPushAvailable()) return "unavailable";

  const { PushNotifications } = await import("@capacitor/push-notifications");
  const status = await PushNotifications.checkPermissions();
  const receive = status.receive;

  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

/** Request OS permission and register for a push token. */
export async function registerPush(): Promise<{
  ok: boolean;
  permission: PushPermissionState;
}> {
  if (!isPushAvailable()) {
    return { ok: false, permission: "unavailable" };
  }

  const { PushNotifications } = await import("@capacitor/push-notifications");

  let permission = await getPushPermissionState();
  if (permission === "prompt") {
    const result = await PushNotifications.requestPermissions();
    permission =
      result.receive === "granted"
        ? "granted"
        : result.receive === "denied"
          ? "denied"
          : "prompt";
  }

  if (permission !== "granted") {
    return { ok: false, permission };
  }

  await PushNotifications.register();
  return { ok: true, permission };
}

/**
 * Re-register silently when permission is already granted (launch / login).
 * Never prompts the user.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (!isPushAvailable()) return;

  const permission = await getPushPermissionState();
  if (permission !== "granted") return;

  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.register();

  const stored = getStoredDeviceToken();
  if (stored) {
    await upsertDeviceToken(stored, true);
  }
}

/** Disable push for this device token (keep row). */
export async function unregisterPush(): Promise<void> {
  if (!isPushAvailable()) return;

  const token = getStoredDeviceToken();
  if (token) {
    await setTokenEnabled(token, false);
  }
}

/** Whether OS permission is granted AND our DB flag is enabled for this token. */
export async function isPushEnabledForDevice(): Promise<boolean> {
  if (!isPushAvailable()) return false;

  const permission = await getPushPermissionState();
  if (permission !== "granted") return false;

  const token = getStoredDeviceToken();
  if (!token) return false;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("device_tokens")
    .select("enabled")
    .eq("user_id", user.id)
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return false;
  return data.enabled === true;
}

/** Open the app's page in iOS Settings (UIApplication.openSettingsURLString). */
export async function openAppNotificationSettings(): Promise<void> {
  if (!isPushAvailable()) return;
  await OpenSettings.openAppSettings();
}

export function conversationPathFromPushPayload(
  payload: PushNotificationTapPayload,
): string {
  if (!payload.conversationId) return "/chats";
  if (payload.conversationType === "group") {
    return `/chats/group/${payload.conversationId}`;
  }
  return `/chats/${payload.conversationId}`;
}
