"use client";

import { useRouter } from "next/navigation";
import { LockIcon } from "@/components/icons";
import { dismissPrivacyNotice } from "@/lib/privacy-notice";

export function PrivacyNotice() {
  const router = useRouter();

  function acknowledge() {
    dismissPrivacyNotice();
    router.replace("/chats");
    router.refresh();
  }

  return (
    <div className="safe-pb safe-pt flex min-h-dvh flex-1 items-center justify-center bg-[#0C0A09] px-4 py-10">
      <div className="w-full max-w-lg">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight text-[#EA580C]">
          Celesth
        </p>
        <div className="rounded-2xl border border-[#292524] bg-[#1C1917] p-6 sm:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#292524] bg-[#0C0A09]">
            <LockIcon className="h-5 w-5 text-[#EA580C]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAF9]">
            How your privacy works
          </h1>
          <ul className="mt-5 space-y-4 text-[15px] leading-relaxed text-[#A8A29E]">
            <li>
              You signed up with only a username — we never collect your email,
              phone number, or name.
            </li>
            <li>
              Messages are encrypted on your device — our servers only ever see
              scrambled data and cannot read your messages.
            </li>
            <li>
              Your encryption key lives only on this device. Download a backup
              in Settings.
            </li>
            <li>
              If you lose your password, or lose your device AND your key
              backup, your account or message history cannot be recovered by
              anyone, including us.
            </li>
          </ul>
          <button
            type="button"
            onClick={acknowledge}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-2xl bg-[#EA580C] px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#C2410C]"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
