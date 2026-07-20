"use client";

import Link from "next/link";
import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { InlineSpinner } from "@/components/inline-spinner";
import { Logo } from "@/components/logo";

export function scrollAuthFieldIntoView(e: React.FocusEvent<HTMLElement>) {
  e.target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function AuthBrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <Logo markSize={28} />
      <p className="mt-[var(--sp-2)] text-[length:var(--text-secondary-size)] leading-[1.4] text-[var(--text-secondary)]">
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
    <div className="mt-[var(--sp-6)] flex items-start justify-between gap-[var(--sp-3)]">
      <h1 className="text-[length:var(--text-title-lg)] font-bold leading-tight text-[var(--text-primary)]">
        {title}
      </h1>
      {progress ? (
        <span className="shrink-0 pt-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
          {progress}
        </span>
      ) : null}
    </div>
  );
}

export function AuthFieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-[var(--sp-2)] block text-[length:var(--text-section)] font-semibold text-[var(--text-secondary)]"
    >
      {children}
    </label>
  );
}

const inputClassName =
  "h-12 w-full rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] text-[length:var(--text-body)] text-[var(--text-primary)] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[var(--accent)]";

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
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  inputRef?: React.Ref<HTMLInputElement>;
  /** When set, Enter is preventDefault'd and this runs (e.g. focus next field). */
  onEnterKey?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && visible ? "text" : type;

  return (
    <div>
      <AuthFieldLabel htmlFor={id}>{label}</AuthFieldLabel>
      <div className="relative">
        <input
          id={id}
          name={name}
          ref={inputRef}
          type={inputType}
          autoComplete={autoComplete}
          enterKeyHint={enterKeyHint}
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
          className={`${inputClassName}${isPassword ? " pr-12" : ""}`}
          required={required}
          minLength={minLength}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="pressable absolute right-0 top-0 flex h-12 w-11 items-center justify-center text-[var(--text-secondary)]"
          >
            {visible ? (
              <EyeOffIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-[var(--sp-1)] text-[length:var(--text-caption)] text-[var(--text-secondary)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-[var(--sp-1)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
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
      className="pressable flex h-[50px] w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--radius-input)] bg-[var(--accent)] px-[var(--sp-4)] text-[length:var(--text-body)] font-semibold text-white active:bg-[var(--accent-pressed)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? <InlineSpinner className="h-4 w-4" /> : null}
      {children}
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
    <p className="text-center text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
      {text}{" "}
      <Link
        href={href}
        className="pressable font-medium text-[var(--accent)]"
      >
        {linkText}
      </Link>
    </p>
  );
}
