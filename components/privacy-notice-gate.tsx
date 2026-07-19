"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { hasDismissedPrivacyNotice } from "@/lib/privacy-notice";

/** Sends users who haven't acknowledged the privacy notice to /welcome. */
export function PrivacyNoticeGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (hasDismissedPrivacyNotice()) {
      setAllowed(true);
      return;
    }
    router.replace("/welcome");
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-[#0F0E0D] p-6 text-[13px] text-[#6E6963]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
