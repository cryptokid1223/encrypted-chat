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
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="username"
          className="mb-1.5 block text-sm font-medium text-[#44403C]"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="h-12 w-full rounded-2xl border border-[#E7E5E4] bg-white px-4 text-[#1C1917] outline-none transition-[border-color] duration-150 focus:border-[#EA580C]"
          required
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-[#44403C]"
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
          className="h-12 w-full rounded-2xl border border-[#E7E5E4] bg-white px-4 text-[#1C1917] outline-none transition-[border-color] duration-150 focus:border-[#EA580C]"
          required
        />
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#EA580C] px-4 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Logging in…" : "Log in"}
      </button>

      <p className="text-center text-sm text-[#78716C]">
        New here?{" "}
        <Link
          href="/signup"
          className="font-medium text-[#EA580C] transition-opacity duration-150 hover:opacity-80"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
