import { AppShell } from "@/components/app-shell";
import { CryptoWarmup } from "@/components/crypto-warmup";
import { KeyGate } from "@/components/key-gate";
import { NicknamesProvider } from "@/components/nicknames-context";
import { PrivacyNoticeGate } from "@/components/privacy-notice-gate";
import { ProfileProvider } from "@/components/profile-context";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivacyNoticeGate>
      <KeyGate>
        <ProfileProvider>
          <NicknamesProvider>
            <CryptoWarmup />
            <AppShell>{children}</AppShell>
          </NicknamesProvider>
        </ProfileProvider>
      </KeyGate>
    </PrivacyNoticeGate>
  );
}
