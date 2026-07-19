"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrivacyNotice } from "@/components/privacy-notice";
import { hasDismissedPrivacyNotice } from "@/lib/privacy-notice";

export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hasDismissedPrivacyNotice()) {
      router.replace("/chats");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-6 text-sm text-neutral-600">
        Loading…
      </div>
    );
  }

  return <PrivacyNotice />;
}
