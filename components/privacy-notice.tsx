"use client";

import { useRouter } from "next/navigation";
import { dismissPrivacyNotice } from "@/lib/privacy-notice";

export function PrivacyNotice() {
  const router = useRouter();

  function acknowledge() {
    dismissPrivacyNotice();
    router.replace("/chats");
    router.refresh();
  }

  return (
    <div className="safe-pb flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
          How your privacy works
        </h1>
        <ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-relaxed text-[#44403C]">
          <li>
            You signed up with only a username — we never collect your email,
            phone number, or name.
          </li>
          <li>
            Messages are encrypted on your device — our servers only ever see
            scrambled data and cannot read your messages.
          </li>
          <li>
            Your encryption key lives only on this device. Download a backup in
            Settings.
          </li>
          <li>
            If you lose your password, or lose your device AND your key backup,
            your account or message history cannot be recovered by anyone,
            including us.
          </li>
        </ul>
        <button
          type="button"
          onClick={acknowledge}
          className="mt-8 flex h-12 w-full items-center justify-center rounded-2xl bg-[#EA580C] px-4 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
        >
          I understand
        </button>
      </div>
    </div>
  );
}
