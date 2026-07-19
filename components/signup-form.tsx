"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  passwordStrengthHint,
  usernameToAuthEmail,
  validateUsername,
} from "@/lib/auth-email";
import { generateKeyPair } from "@/lib/crypto";
import { savePrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-neutral-800">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="w-full border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-[#EA580C]"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-neutral-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-[#EA580C]"
          required
          minLength={10}
        />
        {strength ? (
          <p className="mt-1.5 text-xs text-neutral-600">{strength}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-neutral-800">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-[#EA580C]"
          required
          minLength={10}
        />
      </div>

      <div className="border border-[#EA580C] bg-[#FFF7ED] p-4">
        <p className="text-sm font-medium leading-relaxed text-neutral-900">
          No email means no password reset. If you forget your password, this
          account cannot be recovered by anyone. Save it in a password manager.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 accent-[#EA580C]"
          />
          <span>I understand — I will save my password myself.</span>
        </label>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full border border-[#EA580C] bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-neutral-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#EA580C] hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
