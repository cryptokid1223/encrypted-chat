"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { GearIcon } from "@/components/icons";
import { Avatar, DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

export function AppShell({ children }: { children: ReactNode }) {
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR_ID);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("profiles")
        .select("avatar_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled && data?.avatar_id) {
        setAvatarId(data.avatar_id as string);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="safe-pt border-b border-[#E7E5E4] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
          <Link
            href="/chats"
            className="text-[17px] font-semibold tracking-tight text-[#EA580C] transition-opacity duration-150 hover:opacity-80"
          >
            Celesth
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#57534E] transition-colors duration-150 hover:bg-[#F5F5F4] hover:text-[#1C1917]"
            >
              <GearIcon className="h-5 w-5" />
            </Link>
            <Link
              href="/settings"
              aria-label="Your profile"
              className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-90"
            >
              <Avatar avatarId={avatarId} size={32} />
            </Link>
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
