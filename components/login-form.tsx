"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usernameToAuthEmail, validateUsername } from "@/lib/auth-email";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
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
        setError("Invalid username or password.");
        return;
      }

      router.replace("/chats");
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 w-full rounded-xl border border-[#2E2B28] bg-[#242220] px-4 text-[14px] text-[#FAFAF9] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
          required
        />
      </div>

      {error ? (
        <p className="text-[13px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[#EA580C] px-4 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Logging in…" : "Log in"}
      </button>

      <p className="text-center text-[13px] text-[#6E6963]">
        New here?{" "}
        <Link
          href="/signup"
          className="font-medium text-[#EA580C] transition-colors duration-150 ease-in-out hover:text-[#C2410C]"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
