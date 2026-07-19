import { AppShell } from "@/components/app-shell";
import { KeyGate } from "@/components/key-gate";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <KeyGate>
      <AppShell>
        <SettingsPanel />
      </AppShell>
    </KeyGate>
  );
}
