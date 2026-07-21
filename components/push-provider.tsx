"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  conversationPathFromPushPayload,
  initPushListeners,
  isPushAvailable,
  refreshPushRegistration,
  unregisterPush,
  type PushNotificationTapPayload,
} from "@/lib/push";

/** iOS push listeners, silent token refresh, and notification-tap routing. */
export function PushProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const onNotificationTap = useCallback(
    (payload: PushNotificationTapPayload) => {
      router.push(conversationPathFromPushPayload(payload));
    },
    [router],
  );

  useEffect(() => {
    if (!isPushAvailable()) return;

    void initPushListeners({ onNotificationTap });
  }, [onNotificationTap]);

  useEffect(() => {
    if (!isPushAvailable()) return;

    const supabase = createClient();

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await refreshPushRegistration();
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        await refreshPushRegistration();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}

/** Call before auth.signOut() to disable this device's token. */
export async function logoutWithPushCleanup(
  signOut: () => Promise<unknown>,
): Promise<void> {
  if (isPushAvailable()) {
    await unregisterPush();
  }
  await signOut();
}
