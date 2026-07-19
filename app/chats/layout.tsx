import { AppShell } from "@/components/app-shell";
import { KeyGate } from "@/components/key-gate";
import { PrivacyNoticeGate } from "@/components/privacy-notice-gate";

export default function ChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivacyNoticeGate>
      <KeyGate>
        <AppShell>{children}</AppShell>
      </KeyGate>
    </PrivacyNoticeGate>
  );
}
