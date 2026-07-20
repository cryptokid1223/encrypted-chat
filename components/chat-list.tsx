"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NewChatModal } from "@/components/new-chat-modal";
import { LockIcon, PencilIcon } from "@/components/icons";
import { useNicknames } from "@/components/nicknames-context";
import { formatListTime } from "@/lib/chat";
import { contactMatchesQuery, displayName } from "@/lib/display-name";
import { Avatar, AVATARS } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

type ConversationRow = {
  id: string;
  otherUserId: string;
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

const ConversationRowItem = memo(function ConversationRowItem({
  id,
  otherUsername,
  otherAvatarId,
  nickname,
  lastActivity,
  active,
}: {
  id: string;
  otherUsername: string;
  otherAvatarId: string | null;
  nickname: string | null;
  lastActivity: string;
  active: boolean;
}) {
  const label = displayName({ username: otherUsername, nickname });

  return (
    <Link
      href={`/chats/${id}`}
      className={`flex h-16 items-center gap-3 px-3 transition-colors duration-150 ease-in-out ${
        active
          ? "bg-[#242220]"
          : "hover:bg-[#242220]/70 active:bg-[#242220]"
      }`}
    >
      <Avatar avatarId={otherAvatarId} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-medium text-[#FAFAF9]">
            {label}
          </p>
          <span className="shrink-0 text-[11px] text-[#6E6963]">
            {formatListTime(lastActivity)}
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-[13px] text-[#6E6963]">
          <LockIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">Encrypted message</span>
        </p>
      </div>
    </Link>
  );
});

export function ChatList({
  activeConversationId,
}: {
  activeConversationId?: string | null;
}) {
  const { nicknames, loaded: nicknamesLoaded, loadNicknames } = useNicknames();
  const [composeOpen, setComposeOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const conversationsRef = useRef(conversations);
  const myUserIdRef = useRef<string | null>(null);
  const pendingActivityRef = useRef<Map<string, string>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingActivities = useCallback(() => {
    const pending = pendingActivityRef.current;
    if (pending.size === 0) return;
    pendingActivityRef.current = new Map();
    setConversations((prev) => {
      const updated = prev.map((c) => {
        const nextActivity = pending.get(c.id);
        if (!nextActivity) return c;
        return { ...c, lastActivity: nextActivity };
      });
      return sortByActivity(updated);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

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

      const [convRows] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, participant_a, participant_b, created_at")
          .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          }),
        loadNicknames(),
      ]);

      if (!convRows || convRows.length === 0) {
        setConversations([]);
        return;
      }

      const otherIds = convRows.map((row) =>
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

      const prevById = new Map(
        conversationsRef.current.map((c) => [c.id, c.lastActivity]),
      );

      const next = convRows.map((row) => {
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
          otherUserId: otherId as string,
          otherUsername: profile?.username ?? "unknown",
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
  }, [loadNicknames]);

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
            otherUserId: otherId,
            otherUsername: (profile?.username as string) ?? "unknown",
            otherAvatarId: (profile?.avatar_id as string | null) ?? null,
            lastActivity: row.created_at,
          },
          ...prev,
        ]);
      });
    },
    [],
  );

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return conversations;
    return conversations.filter((c) =>
      contactMatchesQuery(
        {
          username: c.otherUsername,
          nickname: nicknames[c.otherUserId] ?? null,
        },
        q,
      ),
    );
  }, [conversations, nicknames, searchQuery]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

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
              void loadConversations();
              return;
            }

            const currentPending = pendingActivityRef.current.get(
              row.conversation_id,
            );
            if (
              !currentPending ||
              new Date(row.created_at).getTime() >=
                new Date(currentPending).getTime()
            ) {
              pendingActivityRef.current.set(
                row.conversation_id,
                row.created_at,
              );
            }

            if (!flushTimerRef.current) {
              flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = null;
                flushPendingActivities();
              }, 120);
            }
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
  }, [loadConversations, upsertConversationFromRow, flushPendingActivities]);

  const showLoading = loadingList || !nicknamesLoaded;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2 pt-1">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search"
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-[#2E2B28] bg-[#242220] px-3 text-[16px] text-[#FAFAF9] placeholder:text-[#6E6963] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
        />
      </div>

      {showLoading ? (
        <p className="px-3 py-6 text-[13px] text-[#6E6963]">Loading…</p>
      ) : listError ? (
        <p className="px-3 py-6 text-[13px] text-red-400" role="alert">
          {listError}
        </p>
      ) : conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 pb-20 pt-6 text-center">
          <div className="mb-4 flex -space-x-2">
            {AVATARS.slice(0, 4).map((a) => (
              <Avatar
                key={a.id}
                avatarId={a.id}
                size={40}
                className="ring-2 ring-[#1A1816]"
              />
            ))}
          </div>
          <p className="text-[14px] font-medium text-[#FAFAF9]">No chats yet</p>
          <p className="mt-1 max-w-[220px] text-[13px] leading-[1.4] text-[#6E6963]">
            Start a private conversation by username.
          </p>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="mt-4 flex h-10 min-w-[140px] items-center justify-center rounded-xl bg-[#EA580C] px-5 text-[13px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
          >
            Start a chat
          </button>
        </div>
      ) : filteredConversations.length === 0 ? (
        <p className="px-3 py-6 text-[13px] text-[#6E6963]">No matches.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pb-20">
          {filteredConversations.map((c) => (
            <li key={c.id}>
              <ConversationRowItem
                id={c.id}
                otherUsername={c.otherUsername}
                otherAvatarId={c.otherAvatarId}
                nickname={nicknames[c.otherUserId] ?? null}
                lastActivity={c.lastActivity}
                active={activeConversationId === c.id}
              />
            </li>
          ))}
        </ul>
      )}

      {!showLoading ? (
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          aria-label="New chat"
          className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#2E2B28] bg-[#EA580C] text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
        >
          <PencilIcon className="h-5 w-5" />
        </button>
      ) : null}

      <NewChatModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
