"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AuthBrandHeader,
  AuthFooterLink,
  AuthPrimaryButton,
  AuthScreenHeading,
  AuthTextField,
} from "@/components/auth-ui";
import {
  CheckIcon,
  ChevronLeftIcon,
  WarningTriangleIcon,
} from "@/components/icons";
import {
  passwordStrengthHint,
  usernameToAuthEmail,
  validateUsername,
} from "@/lib/auth-email";
import { Avatar, AVATARS, DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { generateKeyPair } from "@/lib/crypto";
import { savePrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

type FieldErrors = {
  username?: string | null;
  password?: string | null;
  confirm?: string | null;
};

function validateStep1Fields(
  username: string,
  password: string,
  confirm: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const usernameError = validateUsername(username);
  if (usernameError) errors.username = usernameError;
  if (password.length < 10) {
    errors.password = "Password must be at least 10 characters.";
  }
  if (password !== confirm) {
    errors.confirm = "Passwords do not match.";
  }
  return errors;
}

function isStep1Valid(username: string, password: string, confirm: string): boolean {
  return (
    !validateUsername(username) &&
    password.length >= 10 &&
    password === confirm
  );
}

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [acknowledged, setAcknowledged] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => passwordStrengthHint(password), [password]);
  const step1Valid = isStep1Valid(username, password, confirm);
  const canSubmit =
    acknowledged && !busy && step1Valid && Boolean(avatarId);

  function handleContinue() {
    setError(null);
    const errors = validateStep1Fields(username, password, confirm);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) {
      setStep(2);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!acknowledged) {
      setError("You must acknowledge that this account cannot be recovered.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();

      const { data: existing, error: lookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (lookupError) {
        setError("Could not check username availability. Try again.");
        return;
      }
      if (existing) {
        setError("That username is taken.");
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: usernameToAuthEmail(username),
        password,
      });

      if (signUpError || !signUpData.user) {
        setError(signUpError?.message ?? "Signup failed.");
        return;
      }

      const { publicKey, privateKey } = await generateKeyPair();

      // The private key is stored only in IndexedDB on this device.
      // It must NEVER be sent to Supabase or any server.
      await savePrivateKey(privateKey);

      const { error: profileError } = await supabase.from("profiles").insert({
        id: signUpData.user.id,
        username,
        public_key: publicKey,
        avatar_id: avatarId,
      });

      if (profileError) {
        setError("Account created but profile setup failed. Try logging in.");
        return;
      }

      router.replace("/welcome");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <div>
        <AuthBrandHeader subtitle="Private messaging. End-to-end encrypted." />
        <AuthScreenHeading title="Create your account" progress="1 of 2" />

        <div className="mt-[var(--sp-6)] space-y-[var(--sp-4)]">
          <AuthTextField
            id="username"
            name="username"
            label="Username"
            autoComplete="username"
            value={username}
            onChange={(value) => {
              setUsername(value.toLowerCase());
              if (fieldErrors.username) {
                setFieldErrors((prev) => ({ ...prev, username: null }));
              }
            }}
            onBlur={() => {
              if (username.trim()) {
                setFieldErrors((prev) => ({
                  ...prev,
                  username: validateUsername(username),
                }));
              }
            }}
            error={fieldErrors.username}
            required
          />

          <AuthTextField
            id="password"
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (fieldErrors.password) {
                setFieldErrors((prev) => ({ ...prev, password: null }));
              }
            }}
            onBlur={() => {
              if (password) {
                setFieldErrors((prev) => ({
                  ...prev,
                  password:
                    password.length < 10
                      ? "Password must be at least 10 characters."
                      : null,
                }));
              }
            }}
            error={fieldErrors.password}
            hint={strength || null}
            required
            minLength={10}
          />

          <AuthTextField
            id="confirm"
            name="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(value) => {
              setConfirm(value);
              if (fieldErrors.confirm) {
                setFieldErrors((prev) => ({ ...prev, confirm: null }));
              }
            }}
            onBlur={() => {
              if (confirm) {
                setFieldErrors((prev) => ({
                  ...prev,
                  confirm:
                    password !== confirm ? "Passwords do not match." : null,
                }));
              }
            }}
            error={fieldErrors.confirm}
            required
            minLength={10}
          />
        </div>

        <div className="mt-[var(--sp-6)]">
          <AuthPrimaryButton
            type="button"
            disabled={!step1Valid}
            onClick={handleContinue}
          >
            Continue
          </AuthPrimaryButton>
        </div>

        <div className="mt-[var(--sp-4)]">
          <AuthFooterLink
            text="Already have an account?"
            linkText="Log in"
            href="/login"
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep(1);
          }}
          aria-label="Back to account details"
          className="absolute left-0 top-0 flex h-11 w-11 items-center justify-center text-[var(--text-secondary)] transition-opacity duration-150 ease-in-out active:opacity-70"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="pl-[var(--sp-8)]">
          <AuthScreenHeading title="Choose your avatar" progress="2 of 2" />
        </div>
      </div>

      <div
        className="mt-[var(--sp-6)] grid grid-cols-4 gap-[var(--sp-3)]"
        role="listbox"
        aria-label="Choose your avatar"
      >
        {AVATARS.map((avatar) => {
          const selected = avatarId === avatar.id;
          return (
            <button
              key={avatar.id}
              type="button"
              role="option"
              aria-selected={selected}
              title={avatar.name}
              onClick={() => setAvatarId(avatar.id)}
              className={`relative flex items-center justify-center rounded-full p-0.5 transition-all duration-150 ease-in-out active:scale-95 active:opacity-80 ${
                selected ? "ring-2 ring-[var(--accent)]" : ""
              }`}
            >
              <Avatar avatarId={avatar.id} size={64} />
              {selected ? (
                <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white ring-2 ring-[var(--bg)]">
                  <CheckIcon className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-[var(--sp-6)] rounded-[var(--radius-card)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-[var(--sp-4)]">
        <div className="flex gap-[var(--sp-3)]">
          <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--text-body)] font-semibold text-[var(--text-primary)]">
              Save your password
            </p>
            <p className="mt-[var(--sp-1)] text-[length:var(--text-secondary-size)] leading-[1.4] text-[var(--text-primary)]">
              Celesth does not use email, so your password cannot be reset. Store
              it somewhere safe.
            </p>
          </div>
        </div>
        <label className="mt-[var(--sp-4)] flex min-h-11 cursor-pointer items-center gap-[var(--sp-3)] text-[length:var(--text-secondary-size)] text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="h-[18px] w-[18px] shrink-0 accent-[var(--accent)]"
          />
          <span>
            I understand that my account cannot be recovered without my password.
          </span>
        </label>
      </div>

      {error ? (
        <p
          className="mt-[var(--sp-4)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-[var(--sp-6)]">
        <AuthPrimaryButton disabled={!canSubmit}>
          {busy ? "Creating account…" : "Create account"}
        </AuthPrimaryButton>
      </div>

      <div className="mt-[var(--sp-4)]">
        <AuthFooterLink
          text="Already have an account?"
          linkText="Log in"
          href="/login"
        />
      </div>
    </form>
  );
}
