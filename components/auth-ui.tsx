"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { InlineSpinner } from "@/components/inline-spinner";

export function scrollAuthFieldIntoView(e: React.FocusEvent<HTMLElement>) {
  e.target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Centered auth column — upper-third start so the keyboard rarely covers fields. */
export function AuthColumn({ children }: { children: ReactNode }) {
  return (
    <div className="screen-enter flex h-app min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[var(--bg)]">
      <div className="safe-pb mx-auto w-full max-w-[400px] px-6 pb-[var(--sp-8)] pt-[max(calc(var(--safe-top)+1.25rem),12vh)]">
        {children}
      </div>
    </div>
  );
}

export function AuthBrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <p className="text-[28px] font-bold leading-none tracking-[-0.03em] text-[var(--text-primary)]">
        Celesth
      </p>
      <p className="mt-[var(--sp-2)] text-[15px] leading-[1.4] text-[var(--text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}

export function AuthScreenHeading({
  title,
  progress,
}: {
  title: string;
  progress?: string;
}) {
  return (
    <div className="mt-[var(--sp-6)] flex items-baseline justify-between gap-[var(--sp-3)]">
      <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
        {title}
      </h1>
      {progress ? (
        <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
          {progress}
        </span>
      ) : null}
    </div>
  );
}

const inputClassName =
  "h-[52px] w-full rounded-[12px] border border-[var(--auth-input-border)] bg-[var(--surface)] px-4 text-[16px] text-[var(--text-primary)] outline-none transition-[border-color] duration-150 ease-in-out placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)]";

export function AuthTextField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  autoComplete,
  required,
  minLength,
  error,
  hint,
  hintTone,
  enterKeyHint,
  inputRef,
  onEnterKey,
}: {
  id: string;
  name: string;
  label: string;
  type?: "text" | "password";
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  error?: string | null;
  hint?: string | null;
  /** CSS color for password-strength / secondary hint line. */
  hintTone?: string;
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  inputRef?: React.Ref<HTMLInputElement>;
  /** When set, Enter is preventDefault'd and this runs (e.g. focus next field). */
  onEnterKey?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && visible ? "text" : type;
  const hasError = Boolean(error);

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          name={name}
          ref={inputRef}
          type={inputType}
          autoComplete={autoComplete}
          enterKeyHint={enterKeyHint}
          placeholder={label}
          aria-label={label}
          aria-invalid={hasError || undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={scrollAuthFieldIntoView}
          onKeyDown={
            onEnterKey
              ? (e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  onEnterKey();
                }
              : undefined
          }
          className={`${inputClassName}${isPassword ? " pr-12" : ""}${
            hasError ? " border-[var(--danger)]" : ""
          }`}
          required={required}
          minLength={minLength}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="pressable absolute right-0 top-0 flex h-[52px] w-11 items-center justify-center text-[var(--text-secondary)]"
          >
            {visible ? (
              <EyeOffIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        ) : null}
      </div>
      {/* Reserved line so errors don't shove the primary button. */}
      <div className="mt-1 min-h-[18px]">
        {error ? (
          <p className="text-[13px] leading-tight text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p
            className="text-[13px] leading-tight"
            style={{ color: hintTone ?? "var(--text-secondary)" }}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  disabled,
  loading = false,
  type = "submit",
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading || undefined}
      className="pressable flex h-[52px] w-full items-center justify-center gap-[var(--sp-2)] rounded-[12px] bg-[var(--accent)] px-4 text-[16px] font-semibold text-white active:bg-[var(--accent-pressed)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? <InlineSpinner className="h-4 w-4" /> : children}
    </button>
  );
}

export function AuthFooterLink({
  text,
  linkText,
  href,
}: {
  text: string;
  linkText: string;
  href: string;
}) {
  return (
    <p className="mt-4 text-center text-[15px] text-[var(--text-secondary)]">
      {text}{" "}
      <Link href={href} className="pressable font-medium text-[var(--accent)]">
        {linkText}
      </Link>
    </p>
  );
}

export function AuthRestoringScreen() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
      <InlineSpinner className="h-6 w-6 text-[var(--accent)]" />
      <p className="mt-4 text-[16px] font-semibold text-[var(--text-primary)]">
        Restoring your messages…
      </p>
      <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
        Decrypting with your password
      </p>
    </div>
  );
}

/** Map existing passwordStrengthHint() strings to color tokens (UI only). */
export function passwordStrengthTone(hint: string): string | undefined {
  if (!hint) return undefined;
  if (hint.startsWith("Too short") || hint.startsWith("Add letters")) {
    return "var(--strength-weak)";
  }
  if (hint.startsWith("Decent")) return "var(--strength-ok)";
  if (hint.startsWith("Strong")) return "var(--strength-strong)";
  return "var(--text-secondary)";
}
