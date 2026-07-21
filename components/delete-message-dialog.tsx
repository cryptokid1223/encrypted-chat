"use client";

import { SettingsConfirmDialog } from "@/components/settings-ui";

export function DeleteForEveryoneDialog({
  confirming,
  onConfirm,
  onCancel,
}: {
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <SettingsConfirmDialog
      title="Delete for everyone?"
      description="This will remove the message for all members of this chat."
      confirmLabel={confirming ? "Deleting…" : "Delete"}
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirming={confirming}
      destructive
    />
  );
}
