"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { NewChatModal } from "@/components/new-chat-modal";
import { LockIcon, PencilIcon } from "@/components/icons";
import { Avatar, AVATARS } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

type ConversationRow = {
  id: string;
  otherUsername: string;
  otherAvatarId: string | null;
  lastActivity: string;
};

type ConversationInsert = {
  id: string;
  participant_a: string;
  participant_b: string;
  created_at: string;
};

type MessageInsert = {
  id: string;
  conversation_id: string;
  created_at: string;
};

function sortByActivity(rows: ConversationRow[]): ConversationRow[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
}

export function ChatList({
  activeConversationId,
}: {
  activeConversationId?: string | null;
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const conversationsRef = useRef(conversations);
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    myUserIdRef.current = myUserId;
  }, [myUserId]);

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

      setMyUserId(user.id);
      myUserIdRef.current = user.id;

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

      // Preserve fresher lastActivity from live events across soft refreshes.
      const prevById = new Map(
        conversationsRef.current.map((c) => [c.id, c.lastActivity]),
      );

      const next = rows.map((row) => {
        const otherId =
          row.participant_a === user.id
            ? row.participant_b
            : row.participant_a;
        const profile = profileById.get(otherId as string);
        const createdAt = row.created_at as string;
        const prior = prevById.get(row.id as string);
        const lastActivity =
          prior && new Date(prior).getTime() > new Date(createdAt).getTime()
            ? prior
            : createdAt;

        return {
          id: row.id as string,
          otherUsername: profile?.username ?? "Unknown",
          otherAvatarId: profile?.avatar_id ?? null,
          lastActivity,
        };
      });

      setConversations(sortByActivity(next));
    } catch {
      setListError("Could not load conversations.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const upsertConversationFromRow = useCallback(
    async (row: ConversationInsert) => {
      const userId = myUserIdRef.current;
      if (!userId) return;
      if (row.participant_a !== userId && row.participant_b !== userId) return;

      if (conversationsRef.current.some((c) => c.id === row.id)) {
        return;
      }

      const otherId =
        row.participant_a === userId ? row.participant_b : row.participant_a;

      const supabase = createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_id")
        .eq("id", otherId)
        .maybeSingle();

      setConversations((prev) => {
        if (prev.some((c) => c.id === row.id)) return prev;
        return sortByActivity([
          {
            id: row.id,
            otherUsername: (profile?.username as string) ?? "Unknown",
            otherAvatarId: (profile?.avatar_id as string | null) ?? null,
            lastActivity: row.created_at,
          },
          ...prev,
        ]);
      });
    },
    [],
  );

  // Initial fetch
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Global inbox realtime — conversations + messages for this user (RLS still applies)
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      setMyUserId(user.id);
      myUserIdRef.current = user.id;

      channel = supabase
        .channel(`inbox:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "conversations",
            filter: `participant_a=eq.${user.id}`,
          },
          (payload) => {
            void upsertConversationFromRow(payload.new as ConversationInsert);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "conversations",
            filter: `participant_b=eq.${user.id}`,
          },
          (payload) => {
            void upsertConversationFromRow(payload.new as ConversationInsert);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            const row = payload.new as MessageInsert;
            if (!row?.conversation_id || !row.created_at) return;

            const known = conversationsRef.current.some(
              (c) => c.id === row.conversation_id,
            );

            if (!known) {
              // New thread we haven't listed yet (race with conversation INSERT) — full refresh.
              void loadConversations();
              return;
            }

            // Bump to top by last activity (works for open and closed chats).
            setConversations((prev) =>
              sortByActivity(
                prev.map((c) =>
                  c.id === row.conversation_id
                    ? {
                        ...c,
                        lastActivity:
                          new Date(row.created_at).getTime() >=
                          new Date(c.lastActivity).getTime()
                            ? row.created_at
                            : c.lastActivity,
                      }
                    : c,
                ),
              ),
            );
          },
        )
        .subscribe();
    }

    void setup();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [loadConversations, upsertConversationFromRow]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-2 pt-4">
        <h1 className="text-xl font-semibold tracking-tight text-[#FAFAF9]">
          Chats
        </h1>
      </div>

      {loadingList ? (
        <p className="px-4 py-8 text-sm text-[#A8A29E]">Loading…</p>
      ) : listError ? (
        <p className="px-4 py-8 text-sm text-red-400" role="alert">
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
                className="ring-2 ring-[#1C1917]"
              />
            ))}
          </div>
          <h2 className="text-lg font-semibold text-[#FAFAF9]">No chats yet</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#A8A29E]">
            Start a private conversation with someone by their Celesth username.
          </p>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="mt-6 flex h-12 min-w-[160px] items-center justify-center rounded-2xl bg-[#EA580C] px-6 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#C2410C]"
          >
            Start a chat
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pb-24">
          {conversations.map((c) => {
            const active = activeConversationId === c.id;
            return (
              <li key={c.id}>
                <Link
                  href={`/chats/${c.id}`}
                  className={`flex min-h-[72px] items-center gap-3 border-l-2 px-4 py-3 transition-colors duration-150 ${
                    active
                      ? "border-[#EA580C] bg-[#292524]"
                      : "border-transparent hover:bg-[#292524]/60 active:bg-[#292524]"
                  }`}
                >
                  <Avatar avatarId={c.otherAvatarId} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-[#FAFAF9]">
                      {c.otherUsername}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-[#A8A29E]">
                      <LockIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate">Encrypted message</span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!loadingList ? (
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          aria-label="New chat"
          className="absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EA580C] text-white transition-colors duration-150 hover:bg-[#C2410C] active:bg-[#C2410C]"
        >
          <PencilIcon className="h-6 w-6" />
        </button>
      ) : null}

      <NewChatModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
