"use client";

import { SettingsConfirmDialog } from "@/components/settings-ui";

export function DeleteConversationDialog({
  peerName,
  confirming,
  onConfirm,
  onCancel,
}: {
  peerName: string;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <SettingsConfirmDialog
      title="Delete this conversation?"
      description={`This removes the conversation and its messages from your account on all your devices. ${peerName} will still have their copy. New messages from ${peerName} will start a fresh conversation.`}
      confirmLabel={confirming ? "Deleting…" : "Delete"}
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirming={confirming}
      destructive
    />
  );
}
