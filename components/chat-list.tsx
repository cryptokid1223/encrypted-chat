"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NewChatModal } from "@/components/new-chat-modal";
import { PencilIcon, SearchIcon } from "@/components/icons";
import { useNicknames } from "@/components/nicknames-context";
import { useProfile } from "@/components/profile-context";
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

function ListSkeleton() {
  return (
    <ul className="pb-[var(--sp-8)]" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <li
          key={i}
          className="flex min-h-[64px] items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]"
        >
          <div className="h-12 w-12 shrink-0 rounded-full skeleton-shimmer" />
          <div className="min-w-0 flex-1 space-y-[var(--sp-2)]">
            <div className="h-4 w-[55%] rounded skeleton-shimmer" />
            <div className="h-3 w-[75%] rounded skeleton-shimmer" />
          </div>
        </li>
      ))}
    </ul>
  );
}

const ConversationRowItem = memo(function ConversationRowItem({
  id,
  otherUsername,
  otherAvatarId,
  nickname,
  lastActivity,
  active,
  isLast,
}: {
  id: string;
  otherUsername: string;
  otherAvatarId: string | null;
  nickname: string | null;
  lastActivity: string;
  active: boolean;
  isLast: boolean;
}) {
  const label = displayName({ username: otherUsername, nickname });

  return (
    <Link
      href={`/chats/${id}`}
      className={`row-press flex min-h-[64px] min-w-0 items-center gap-[var(--sp-3)] px-[var(--sp-4)] ${
        active ? "bg-[var(--surface)]" : ""
      }`}
    >
      <Avatar avatarId={otherAvatarId} size={48} className="shrink-0" />
      <div
        className={`flex min-w-0 flex-1 flex-col justify-center self-stretch py-[var(--sp-3)] ${
          isLast ? "" : "border-b border-[var(--divider)]"
        }`}
      >
        <div className="flex items-baseline justify-between gap-[var(--sp-2)]">
          <p className="truncate text-[length:var(--text-body)] font-semibold text-[var(--text-primary)]">
            {label}
          </p>
          <span className="shrink-0 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
            {formatListTime(lastActivity)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
          Encrypted message
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
  const { avatarId } = useProfile();
  const { nicknames, loaded: nicknamesLoaded, loadNicknames } = useNicknames();
  const [composeOpen, setComposeOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [listScrolled, setListScrolled] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef(conversations);
  const myUserIdRef = useRef<string | null>(null);
  const pendingActivityRef = useRef<Map<string, string>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleListScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setListScrolled(el.scrollTop > 0);
  }, []);

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
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-[var(--bg)] screen-enter">
      <header
        className={`safe-pt shrink-0 bg-[var(--bg)] transition-[border-color] duration-150 ${
          listScrolled ? "border-b border-[var(--divider)]" : "border-b border-transparent"
        }`}
      >
        <div className="flex items-center justify-between px-[var(--sp-4)] pb-[var(--sp-2)] pt-[var(--sp-2)]">
          <h1 className="text-[length:var(--text-title-lg)] font-bold leading-tight text-[var(--text-primary)]">
            Chats
          </h1>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              aria-label="New message"
              className="pressable flex h-11 w-11 items-center justify-center text-[var(--text-primary)]"
            >
              <PencilIcon className="h-[22px] w-[22px]" />
            </button>
            <Link
              href={
                activeConversationId
                  ? `/settings?returnTo=${encodeURIComponent(`/chats/${activeConversationId}`)}`
                  : "/settings"
              }
              aria-label="Profile and settings"
              className="pressable flex h-11 w-11 items-center justify-center"
            >
              <Avatar avatarId={avatarId} size={32} />
            </Link>
          </div>
        </div>
      </header>

      {!showLoading && conversations.length > 0 ? (
        <div className="shrink-0 px-[var(--sp-4)] py-[var(--sp-2)]">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-[var(--sp-3)] top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              autoComplete="off"
              className="h-9 w-full rounded-[var(--radius-input)] bg-[var(--surface)] pl-[calc(var(--sp-3)+1.25rem)] pr-[var(--sp-3)] text-[length:var(--text-body)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
            />
          </label>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={handleListScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {showLoading ? (
          <ListSkeleton />
        ) : (
          <>
            {listError ? (
              <p
                className="px-[var(--sp-4)] py-[var(--sp-6)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
                role="alert"
              >
                {listError}
              </p>
            ) : conversations.length === 0 ? (
              <div
                className="flex flex-col items-center px-[var(--sp-5)] pb-[var(--sp-8)] text-center"
                style={{ paddingTop: "min(40vh, 280px)" }}
              >
                <div className="mb-[var(--sp-4)] flex h-16 -space-x-2">
                  {AVATARS.slice(0, 4).map((a) => (
                    <Avatar
                      key={a.id}
                      avatarId={a.id}
                      size={32}
                      className="ring-2 ring-[var(--bg)]"
                    />
                  ))}
                </div>
                <p className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]">
                  No chats yet
                </p>
                <p className="mt-[var(--sp-1)] max-w-[240px] text-[length:var(--text-secondary-size)] leading-[1.4] text-[var(--text-secondary)]">
                  Start a private conversation by username.
                </p>
                <button
                  type="button"
                  onClick={() => setComposeOpen(true)}
                  className="mt-[var(--sp-4)] pressable flex h-11 items-center justify-center rounded-[var(--radius-input)] bg-[var(--accent)] px-[var(--sp-6)] text-[length:var(--text-secondary-size)] font-medium text-white active:bg-[var(--accent-pressed)]"
                >
                  New message
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <p className="px-[var(--sp-4)] py-[var(--sp-6)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                No matches.
              </p>
            ) : (
              <ul className="pb-[var(--sp-8)]">
                {filteredConversations.map((c, index) => (
                  <li key={c.id}>
                    <ConversationRowItem
                      id={c.id}
                      otherUsername={c.otherUsername}
                      otherAvatarId={c.otherAvatarId}
                      nickname={nicknames[c.otherUserId] ?? null}
                      lastActivity={c.lastActivity}
                      active={activeConversationId === c.id}
                      isLast={index === filteredConversations.length - 1}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <NewChatModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
