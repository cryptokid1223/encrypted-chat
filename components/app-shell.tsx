"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-neutral-300 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
          <Link href="/chats" className="text-lg font-semibold text-[#EA580C]">
            Cipher
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/chats" className="text-neutral-800 hover:text-[#EA580C]">
              Chats
            </Link>
            <Link href="/settings" className="text-neutral-800 hover:text-[#EA580C]">
              Settings
            </Link>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="text-neutral-800 hover:text-[#EA580C] disabled:opacity-40"
            >
              {loggingOut ? "…" : "Log out"}
            </button>
          </nav>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
