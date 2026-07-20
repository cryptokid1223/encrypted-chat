"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";

/** 28px rounded-square badge — iOS Settings glyph style. */
export function SettingsIconBadge({
  tint,
  children,
}: {
  tint: string;
  children: ReactNode;
}) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-white [&_svg]:h-4 [&_svg]:w-4"
      style={{ backgroundColor: tint }}
      aria-hidden
    >
      {children}
    </span>
  );
}

export function SettingsSection({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mt-6">
      {title ? (
        <h2 className="mb-2 px-4 text-[13px] font-normal uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          {title}
        </h2>
      ) : null}
      <div className="overflow-hidden rounded-[var(--settings-card-radius)] bg-[var(--surface)]">
        {children}
      </div>
      {footer ? (
        <div className="mt-2 px-4 text-[13px] leading-[1.4] text-[var(--text-secondary)]">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function SettingsRow({
  label,
  value,
  icon,
  iconTint,
  onClick,
  chevron = false,
  destructive = false,
  disabled = false,
  isLast = false,
}: {
  label: string;
  value?: string;
  icon?: ReactNode;
  /** CSS color for the leading icon badge (token). */
  iconTint?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  const hasIcon = Boolean(icon);
  const tint = iconTint ?? "var(--settings-tint-gray)";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[var(--settings-row-height)] w-full items-center gap-3 px-4 text-left ${
        onClick ? "row-press-elevated disabled:opacity-40" : ""
      }`}
    >
      {hasIcon ? (
        <SettingsIconBadge tint={tint}>{icon}</SettingsIconBadge>
      ) : null}
      <div
        className={`flex min-h-0 min-w-0 flex-1 items-center justify-between gap-3 self-stretch ${
          isLast
            ? ""
            : "border-b border-[var(--settings-separator)]"
        }`}
      >
        <span
          className={`truncate text-[16px] ${
            destructive
              ? "text-[var(--danger)]"
              : "text-[var(--text-primary)]"
          }`}
        >
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {value ? (
            <span className="max-w-[160px] truncate text-[14px] text-[var(--text-secondary)]">
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

export function SettingsToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
  isLast = false,
  icon,
  iconTint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
  icon?: ReactNode;
  iconTint?: string;
}) {
  const tint = iconTint ?? "var(--settings-tint-purple)";
  const switchId = `settings-toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div
      className={`flex h-[var(--settings-row-height)] w-full items-center gap-3 px-4 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      {icon ? (
        <SettingsIconBadge tint={tint}>{icon}</SettingsIconBadge>
      ) : null}
      <div
        className={`flex min-h-0 min-w-0 flex-1 items-center justify-between gap-3 self-stretch ${
          isLast ? "" : "border-b border-[var(--settings-separator)]"
        }`}
      >
        <label
          htmlFor={switchId}
          className="min-w-0 flex-1 cursor-pointer truncate text-[16px] text-[var(--text-primary)]"
        >
          {label}
        </label>
        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className="relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed"
          style={{
            backgroundColor: checked
              ? "var(--accent)"
              : "var(--divider)",
          }}
        >
          <span
            aria-hidden
            className="absolute left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-150 ease-out"
            style={{
              transform: checked ? "translateX(20px)" : "translateX(0)",
            }}
          />
        </button>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        className="screen-enter relative z-10 w-full max-w-sm rounded-[var(--settings-card-radius)] bg-[var(--surface-elevated)] p-5"
      >
        <p
          id="settings-dialog-title"
          className="text-[17px] font-semibold text-[var(--text-primary)]"
        >
          {title}
        </p>
        <p
          id="settings-dialog-desc"
          className="mt-2 text-[14px] leading-[1.4] text-[var(--text-secondary)]"
        >
          {description}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`flex min-h-11 w-full items-center justify-center rounded-[12px] text-[16px] font-semibold transition-opacity duration-150 ease-in-out disabled:opacity-40 ${
              destructive
                ? "pressable text-[var(--danger)]"
                : "pressable bg-[var(--accent)] text-white active:bg-[var(--accent-pressed)]"
            }`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="pressable flex min-h-11 w-full items-center justify-center rounded-[12px] text-[16px] font-medium text-[var(--text-primary)] disabled:opacity-40"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
