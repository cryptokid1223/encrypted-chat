"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { ChatList } from "@/components/chat-list";
import { Logo } from "@/components/logo";
import { LockIcon } from "@/components/icons";
import { useProfile } from "@/components/profile-context";
import { Avatar } from "@/lib/avatars";

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
  const { avatarId } = useProfile();

  const isChatList = pathname === "/chats";
  const isSettings = pathname === "/settings";
  const activeConversationId = pathname.startsWith("/chats/")
    ? pathname.slice("/chats/".length).split("/")[0] || null
    : null;

  return (
    <div className="safe-px flex h-app w-full overflow-hidden bg-[#0F0E0D]">
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
                aria-label="Profile and settings"
                className="flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150 ease-in-out hover:bg-[#242220] active:bg-[#242220]"
              >
                <Avatar avatarId={avatarId} size={32} />
              </Link>
            </div>
          </header>

          <ChatList activeConversationId={activeConversationId} />
        </aside>

        <main
          className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0F0E0D] ${
            isChatList && !isSettings ? "hidden md:flex" : "flex"
          }`}
        >
          {isChatList && !isSettings ? <EmptyChatPane /> : children}
        </main>
      </div>
    </div>
  );
}
