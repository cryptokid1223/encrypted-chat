"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  AuthBrandHeader,
  AuthFooterLink,
  AuthPrimaryButton,
  AuthScreenHeading,
  AuthTextField,
} from "@/components/auth-ui";
import { usernameToAuthEmail, validateUsername } from "@/lib/auth-email";
import { createClient } from "@/lib/supabase/client";
import { tryRestoreKeyFromPassword } from "@/lib/wrappedKeys";

function blurActiveElement() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    blurActiveElement();
    setUsernameError(null);
    setGeneralError(null);

    const validationError = validateUsername(username);
    if (validationError) {
      setUsernameError(validationError);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: usernameToAuthEmail(username),
          password,
        });

      if (signInError || !signInData.user) {
        setGeneralError("Invalid username or password.");
        return;
      }

      const userId = signInData.user.id;

      // Transparent password restore when this device has no key yet.
      // already_present / restored → enter app with a key.
      // missing_row / failed → KeyGate shows the existing QR/file restore screen.
      setRestoring(true);
      await tryRestoreKeyFromPassword(userId, password);
      setRestoring(false);

      router.replace("/chats");
      router.refresh();
    } catch {
      setRestoring(false);
      setGeneralError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <AuthBrandHeader subtitle="Private messaging. End-to-end encrypted." />
      <AuthScreenHeading title="Log in" />

      <div className="mt-[var(--sp-6)] space-y-[var(--sp-4)]">
        <AuthTextField
          id="username"
          name="username"
          label="Username"
          autoComplete="username"
          enterKeyHint="next"
          value={username}
          onChange={(value) => {
            setUsername(value.toLowerCase());
            if (usernameError) setUsernameError(null);
          }}
          onBlur={() => {
            if (username.trim()) {
              setUsernameError(validateUsername(username));
            }
          }}
          onEnterKey={() => passwordRef.current?.focus()}
          error={usernameError}
          required
        />

        <AuthTextField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          inputRef={passwordRef}
          value={password}
          onChange={setPassword}
          required
        />
      </div>

      <div className="mt-[var(--sp-6)]">
        <AuthPrimaryButton disabled={busy} loading={busy}>
          {restoring
            ? "Restoring your messages…"
            : busy
              ? "Logging in…"
              : "Log in"}
        </AuthPrimaryButton>
        {generalError ? (
          <p
            className="mt-[var(--sp-2)] text-center text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
            role="alert"
          >
            {generalError}
          </p>
        ) : null}
      </div>

      <div className="mt-[var(--sp-4)]">
        <AuthFooterLink
          text="New to Celesth?"
          linkText="Create account"
          href="/signup"
        />
      </div>
    </form>
  );
}
