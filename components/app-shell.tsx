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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#2E2B28] bg-[#1A1816]">
        <LockIcon className="h-5 w-5 text-[#EA580C]" />
      </div>
      <p className="text-[13px] leading-[1.4] text-[#6E6963]">
        Select a chat or start a new one
      </p>
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
    <div className="safe-px flex h-dvh w-full overflow-hidden bg-[#0F0E0D]">
      <div className="flex h-full min-h-0 w-full max-w-[1400px]">
        <aside
          className={`flex h-full min-h-0 w-full flex-col border-[#2E2B28] bg-[#1A1816] md:w-[320px] md:shrink-0 md:border-r ${
            isChatList ? "flex" : "hidden md:flex"
          }`}
        >
          <header className="safe-pt shrink-0 border-b border-transparent">
            <div className="flex h-12 items-center justify-between px-3">
              <Logo href="/chats" size="sm" markSize={20} />
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-150 ease-in-out hover:bg-[#242220]"
              >
                <Avatar avatarId={avatarId} size={32} />
              </Link>
            </div>
          </header>

          <ChatList activeConversationId={activeConversationId} />
        </aside>

        <main
          className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0F0E0D] ${
            isChatList ? "hidden md:flex" : "flex"
          }`}
        >
          {isChatList ? <EmptyChatPane /> : children}
        </main>
      </div>
    </div>
  );
}
