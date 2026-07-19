"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import {
  passwordStrengthHint,
  usernameToAuthEmail,
  validateUsername,
} from "@/lib/auth-email";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { generateKeyPair } from "@/lib/crypto";
import { savePrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => passwordStrengthHint(password), [password]);
  const canSubmit =
    acknowledged && !busy && username.length > 0 && password.length >= 10;

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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="username"
          className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#6E6963]"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="h-12 w-full rounded-xl border border-[#2E2B28] bg-[#242220] px-4 text-[14px] text-[#FAFAF9] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
          required
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#6E6963]"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 w-full rounded-xl border border-[#2E2B28] bg-[#242220] px-4 text-[14px] text-[#FAFAF9] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
          required
          minLength={10}
        />
        {strength ? (
          <p className="mt-1.5 text-[12px] text-[#6E6963]">{strength}</p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#6E6963]"
        >
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-12 w-full rounded-xl border border-[#2E2B28] bg-[#242220] px-4 text-[14px] text-[#FAFAF9] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
          required
          minLength={10}
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#6E6963]">
          Choose your avatar
        </p>
        <AvatarPicker
          value={avatarId}
          onChange={setAvatarId}
          size={44}
          showLabels={false}
          columns="auth"
        />
      </div>

      <div className="rounded-xl border border-[#78350F]/40 bg-[#451A03] p-3.5">
        <p className="text-[13px] font-medium leading-[1.4] text-[#FBBF24]/90">
          No email means no password reset. If you forget your password, this
          account cannot be recovered by anyone. Save it in a password manager.
        </p>
        <label className="mt-2.5 flex min-h-10 items-start gap-2.5 text-[13px] text-[#FBBF24]/80">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#EA580C]"
          />
          <span>I understand — I will save my password myself.</span>
        </label>
      </div>

      {error ? (
        <p className="text-[13px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[#EA580C] px-4 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-[13px] text-[#6E6963]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[#EA580C] transition-colors duration-150 ease-in-out hover:text-[#C2410C]"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
