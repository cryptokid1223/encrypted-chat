"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-[var(--sp-6)]">
      <h2 className="mb-[var(--sp-2)] pl-[var(--sp-4)] text-[length:var(--text-section)] font-semibold text-[var(--text-secondary)]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  label,
  value,
  icon,
  onClick,
  chevron = false,
  destructive = false,
  disabled = false,
  isLast = false,
}: {
  label: string;
  value?: string;
  icon?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  const hasIcon = Boolean(icon);

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full min-h-12 items-center text-left ${
        hasIcon
          ? "gap-[var(--sp-3)] pl-[var(--sp-4)] pr-[var(--sp-4)]"
          : "px-[var(--sp-4)]"
      } ${
        onClick
          ? "row-press-elevated disabled:opacity-40"
          : ""
      }`}
    >
      {hasIcon ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-secondary)] [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      ) : null}
      <div
        className={`flex min-w-0 flex-1 items-center justify-between gap-[var(--sp-3)] self-stretch py-[var(--sp-3)] ${
          isLast ? "" : "border-b border-[var(--divider)]"
        }`}
      >
        <span
          className={`text-[length:var(--text-body)] ${
            destructive
              ? "font-semibold text-[var(--destructive)]"
              : "text-[var(--text-primary)]"
          }`}
        >
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-[var(--sp-2)]">
          {value ? (
            <span className="max-w-[160px] truncate text-[length:var(--text-body)] text-[var(--text-secondary)]">
              {value}
            </span>
          ) : null}
          {chevron ? (
            <ChevronRightIcon className="h-4 w-4 text-[var(--text-secondary)]" />
          ) : null}
        </span>
      </div>
    </Tag>
  );
}

export function SettingsConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirming,
  destructive = false,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[var(--sp-4)]">
      <button
        type="button"
        aria-label="Close"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-desc"
        className="screen-enter relative z-10 w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-[var(--sp-5)]"
      >
        <p
          id="settings-dialog-title"
          className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]"
        >
          {title}
        </p>
        <p
          id="settings-dialog-desc"
          className="mt-[var(--sp-2)] text-[length:var(--text-secondary-size)] leading-[1.4] text-[var(--text-secondary)]"
        >
          {description}
        </p>
        <div className="mt-[var(--sp-5)] flex flex-col gap-[var(--sp-2)]">
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`flex min-h-11 w-full items-center justify-center rounded-[var(--radius-input)] text-[length:var(--text-body)] font-semibold transition-opacity duration-150 ease-in-out disabled:opacity-40 ${
              destructive
                ? "pressable text-[var(--destructive)]"
                : "pressable bg-[var(--accent)] text-white active:bg-[var(--accent-pressed)]"
            }`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="pressable flex min-h-11 w-full items-center justify-center rounded-[var(--radius-input)] text-[length:var(--text-body)] font-medium text-[var(--text-primary)] disabled:opacity-40"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
