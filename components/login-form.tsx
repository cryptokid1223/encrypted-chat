"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AuthBrandHeader,
  AuthFooterLink,
  AuthPrimaryButton,
  AuthScreenHeading,
  AuthTextField,
} from "@/components/auth-ui";
import { usernameToAuthEmail, validateUsername } from "@/lib/auth-email";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usernameToAuthEmail(username),
        password,
      });

      if (signInError) {
        setGeneralError("Invalid username or password.");
        return;
      }

      router.replace("/chats");
      router.refresh();
    } catch {
      setGeneralError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <AuthBrandHeader subtitle="Private messaging. End-to-end encrypted." />
      <AuthScreenHeading title="Log in" />

      <div className="mt-[var(--sp-6)] space-y-[var(--sp-4)]">
        <AuthTextField
          id="username"
          name="username"
          label="Username"
          autoComplete="username"
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
          error={usernameError}
          required
        />

        <AuthTextField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />
      </div>

      <div className="mt-[var(--sp-6)]">
        <AuthPrimaryButton disabled={busy} loading={busy}>
          {busy ? "Logging in…" : "Log in"}
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
