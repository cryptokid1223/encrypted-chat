"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChatList } from "@/components/chat-list";
import { Logo } from "@/components/logo";
import { LockIcon } from "@/components/icons";
import { Avatar, DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

function EmptyChatPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#292524] bg-[#1C1917]">
        <LockIcon className="h-7 w-7 text-[#EA580C]" />
      </div>
      <div>
        <Logo size="md" className="justify-center" />
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#A8A29E]">
          Select a chat or start a new one
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR_ID);

  const isChatList = pathname === "/chats";
  const activeConversationId = pathname.startsWith("/chats/")
    ? pathname.slice("/chats/".length).split("/")[0] || null
    : null;

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
    <div className="flex h-dvh w-full bg-[#0C0A09]">
      {/* Flush left — no centering gap; max width keeps ultra-wide panes readable */}
      <div className="flex h-full w-full max-w-[1400px]">
        <aside
          className={`safe-pt safe-pb flex h-full w-full flex-col border-[#292524] bg-[#1C1917] md:w-[360px] md:shrink-0 md:border-r ${
            isChatList ? "flex" : "hidden md:flex"
          }`}
        >
          <header className="flex h-14 shrink-0 items-center justify-between px-4">
            <Logo href="/chats" size="md" />
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[#292524]"
            >
              <Avatar
                avatarId={avatarId}
                size={32}
                className="transition-transform duration-150 hover:scale-105"
              />
            </Link>
          </header>
          <div className="h-px w-full bg-[#292524]" />

          <ChatList activeConversationId={activeConversationId} />
        </aside>

        <main
          className={`min-h-0 min-w-0 flex-1 flex-col bg-[#0C0A09] ${
            isChatList ? "hidden md:flex" : "flex"
          }`}
        >
          {isChatList ? <EmptyChatPane /> : children}
        </main>
      </div>
    </div>
  );
}
