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
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg border border-neutral-300 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-neutral-900">
          How your privacy works
        </h1>
        <ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-relaxed text-neutral-800">
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
          className="mt-8 w-full border border-[#EA580C] bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white"
        >
          I understand
        </button>
      </div>
    </div>
  );
}
