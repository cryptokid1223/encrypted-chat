import { AppShell } from "@/components/app-shell";
import { CryptoWarmup } from "@/components/crypto-warmup";
import { KeyGate } from "@/components/key-gate";
import { PrivacyNoticeGate } from "@/components/privacy-notice-gate";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivacyNoticeGate>
      <KeyGate>
        <CryptoWarmup />
        <AppShell>{children}</AppShell>
      </KeyGate>
    </PrivacyNoticeGate>
  );
}
