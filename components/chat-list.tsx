"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NewChatModal } from "@/components/new-chat-modal";
import { LockIcon, PencilIcon } from "@/components/icons";
import { Avatar, AVATARS } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

type ConversationRow = {
  id: string;
  otherUsername: string;
  otherAvatarId: string | null;
};

export function ChatList() {
  const [composeOpen, setComposeOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setListError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setListError("Not signed in.");
        return;
      }

      const { data: rows, error: convError } = await supabase
        .from("conversations")
        .select("id, participant_a, participant_b, created_at")
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (convError) {
        setListError("Could not load conversations.");
        return;
      }

      if (!rows || rows.length === 0) {
        setConversations([]);
        return;
      }

      const otherIds = rows.map((row) =>
        row.participant_a === user.id ? row.participant_b : row.participant_a,
      );

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, avatar_id")
        .in("id", otherIds);

      if (profileError) {
        setListError("Could not load usernames.");
        return;
      }

      const profileById = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          {
            username: p.username as string,
            avatar_id: (p.avatar_id as string | null) ?? null,
          },
        ]),
      );

      setConversations(
        rows.map((row) => {
          const otherId =
            row.participant_a === user.id
              ? row.participant_b
              : row.participant_a;
          const profile = profileById.get(otherId as string);
          return {
            id: row.id as string,
            otherUsername: profile?.username ?? "Unknown",
            otherAvatarId: profile?.avatar_id ?? null,
          };
        }),
      );
    } catch {
      setListError("Could not load conversations.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="px-4 pb-2 pt-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
          Chats
        </h1>
      </div>

      {loadingList ? (
        <p className="px-4 py-8 text-sm text-[#78716C]">Loading…</p>
      ) : listError ? (
        <p className="px-4 py-8 text-sm text-red-700" role="alert">
          {listError}
        </p>
      ) : conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-8 text-center">
          <div className="mb-6 flex -space-x-3">
            {AVATARS.slice(0, 4).map((a) => (
              <Avatar
                key={a.id}
                avatarId={a.id}
                size={48}
                className="ring-2 ring-[#FAFAF9]"
              />
            ))}
          </div>
          <h2 className="text-lg font-semibold text-[#1C1917]">
            No chats yet
          </h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#78716C]">
            Start a private conversation with someone by their Celesth username.
          </p>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="mt-6 flex h-12 min-w-[160px] items-center justify-center rounded-2xl bg-[#EA580C] px-6 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            Start a chat
          </button>
        </div>
      ) : (
        <ul className="flex-1 pb-24">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/chats/${c.id}`}
                className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[#F5F5F4] active:bg-[#F5F5F4]"
              >
                <Avatar avatarId={c.otherAvatarId} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-[#1C1917]">
                    {c.otherUsername}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[13px] text-[#A8A29E]">
                    <LockIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">Encrypted message</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loadingList ? (
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          aria-label="New chat"
          className="safe-pb absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EA580C] text-white transition-opacity duration-150 hover:opacity-90 active:opacity-80"
        >
          <PencilIcon className="h-6 w-6" />
        </button>
      ) : null}

      <NewChatModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
