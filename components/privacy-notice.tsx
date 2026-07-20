"use client";

import { useRouter } from "next/navigation";
import { AuthAtmosphere } from "@/components/auth-atmosphere";
import { Logo } from "@/components/logo";
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
    <div className="relative flex h-full min-h-0 flex-1 justify-center overflow-y-auto bg-[#0F0E0D] px-4 py-8">
      <AuthAtmosphere />
      <div className="safe-pb relative z-10 my-auto w-full max-w-lg">
        <div className="mb-5 flex justify-center">
          <Logo size="lg" markSize={28} />
        </div>
        <div className="rounded-3xl border border-[#2E2B28] bg-[#1A1816] p-8">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-[#2E2B28] bg-[#242220]">
            <LockIcon className="h-4 w-4 text-[#EA580C]" />
          </div>
          <p className="text-[20px] font-semibold leading-[1.4] text-[#FAFAF9]">
            How your privacy works
          </p>
          <ul className="mt-4 space-y-3 text-[14px] leading-[1.4] text-[#6E6963]">
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
            className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#EA580C] px-4 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
