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
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[#0F0E0D] p-6 text-[13px] text-[#6E6963]">
        Loading…
      </div>
    );
  }

  return <PrivacyNotice />;
}
