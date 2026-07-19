"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChatList } from "@/components/chat-list";
import { GearIcon, LockIcon } from "@/components/icons";
import { Avatar, DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

function EmptyChatPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#292524] bg-[#1C1917]">
        <LockIcon className="h-7 w-7 text-[#EA580C]" />
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight text-[#FAFAF9]">
          Celesth
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#A8A29E]">
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
    <div className="flex h-dvh w-full justify-center bg-[#0C0A09]">
      <div className="flex h-full w-full max-w-[1400px]">
        {/* Sidebar — always on md+, on mobile only for chat list */}
        <aside
          className={`safe-pt safe-pb flex h-full w-full flex-col border-[#292524] bg-[#1C1917] md:w-[360px] md:shrink-0 md:border-r ${
            isChatList ? "flex" : "hidden md:flex"
          }`}
        >
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#292524] px-4">
            <Link
              href="/chats"
              className="text-[17px] font-semibold tracking-tight text-[#EA580C] transition-colors duration-150 hover:text-[#C2410C]"
            >
              Celesth
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[#A8A29E] transition-colors duration-150 hover:bg-[#292524] hover:text-[#FAFAF9]"
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
          </header>

          <ChatList activeConversationId={activeConversationId} />
        </aside>

        {/* Right pane — hidden on mobile when showing list */}
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
