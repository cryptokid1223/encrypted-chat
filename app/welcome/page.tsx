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
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-[#0C0A09] p-6 text-sm text-[#A8A29E]">
        Loading…
      </div>
    );
  }

  return <PrivacyNotice />;
}
