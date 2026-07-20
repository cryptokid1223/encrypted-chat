"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { ChatList } from "@/components/chat-list";
import { LockIcon } from "@/components/icons";

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

  const isChatList = pathname === "/chats";
  const isSettings = pathname === "/settings";
  const activeConversationId = pathname.startsWith("/chats/")
    ? pathname.slice("/chats/".length).split("/")[0] || null
    : null;

  return (
    <div className="safe-px flex h-app w-full min-w-0 overflow-hidden overflow-x-hidden bg-[#0F0E0D]">
      <div className="flex h-full min-h-0 w-full max-w-[1400px]">
        <aside
          className={`relative flex h-full min-h-0 w-full flex-col bg-[var(--bg)] md:w-[320px] md:shrink-0 md:border-r md:border-[var(--divider)] ${
            isChatList ? "flex" : "hidden md:flex"
          }`}
        >
          <ChatList activeConversationId={activeConversationId} />
        </aside>

        <main
          className={`screen-enter flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-[#0F0E0D] ${
            isChatList && !isSettings ? "hidden md:flex" : "flex"
          }`}
        >
          {isChatList && !isSettings ? <EmptyChatPane /> : children}
        </main>
      </div>
    </div>
  );
}
