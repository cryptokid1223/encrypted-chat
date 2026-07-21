"use client";

import { SettingsConfirmDialog } from "@/components/settings-ui";
import { BellIcon } from "@/components/icons";

export function PushPrimingSheet({
  onEnable,
  onNotNow,
  enabling,
}: {
  onEnable: () => void;
  onNotNow: () => void;
  enabling?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60"
        onClick={onNotNow}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-priming-title"
        className="sheet-panel-enter safe-pb relative z-10 mx-4 w-full max-w-sm overflow-hidden rounded-[var(--settings-card-radius)] bg-[var(--surface)] sm:mx-0"
      >
        <div className="flex flex-col items-center px-[var(--sp-6)] pb-[var(--sp-4)] pt-[var(--sp-8)] text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--accent)]">
            <BellIcon className="h-7 w-7" />
          </span>
          <h2
            id="push-priming-title"
            className="mt-[var(--sp-5)] text-[20px] font-semibold leading-tight text-[var(--text-primary)]"
          >
            Don&apos;t miss messages
          </h2>
          <p className="mt-[var(--sp-3)] text-[15px] leading-[1.45] text-[var(--text-secondary)]">
            Celesth will notify you when new messages arrive. Notifications
            never show message content — just that something arrived.
          </p>
          <button
            type="button"
            disabled={enabling}
            onClick={onEnable}
            className="pressable mt-[var(--sp-6)] flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--accent)] text-[16px] font-semibold text-white disabled:opacity-60"
          >
            {enabling ? "Enabling…" : "Enable Notifications"}
          </button>
          <button
            type="button"
            disabled={enabling}
            onClick={onNotNow}
            className="pressable mt-[var(--sp-3)] flex min-h-11 w-full items-center justify-center text-[16px] font-medium text-[var(--text-secondary)]"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}

export function PushDeniedSettingsDialog({
  onOpenSettings,
  onCancel,
}: {
  onOpenSettings: () => void;
  onCancel: () => void;
}) {
  return (
    <SettingsConfirmDialog
      title="Notifications disabled"
      description="To receive message alerts, enable notifications for Celesth in iOS Settings."
      confirmLabel="Open Settings"
      cancelLabel="Cancel"
      onConfirm={onOpenSettings}
      onCancel={onCancel}
    />
  );
}
