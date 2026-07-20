"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NewChatModal } from "@/components/new-chat-modal";
import { GroupAvatar } from "@/components/group-avatar";
import { PencilIcon, SearchIcon } from "@/components/icons";
import { useNicknames } from "@/components/nicknames-context";
import { useProfile } from "@/components/profile-context";
import { formatListTime } from "@/lib/chat";
import { fetchConversationPreview, previewFromMessageRow } from "@/lib/conversationPreview";
import { contactMatchesQuery, displayName } from "@/lib/display-name";
import { hasPrivateKey, loadPrivateKey } from "@/lib/keystore";
import type { EncryptedMessageRow } from "@/lib/message-decrypt";
import { fetchMyGroups, fetchGroupForInbox, type GroupRow } from "@/lib/groups";
import { consumeGroupNotice } from "@/lib/groupNotice";
import { WrapSetupBanner } from "@/components/wrap-setup-banner";
import {
  fetchGroupPreview,
  previewFromGroupMessageRow,
  type GroupMessageRow,
} from "@/lib/groupMessages";
import { Avatar, AVATARS } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";

type ConversationRow = {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherAvatarId: string | null;
  otherPublicKey: string;
  lastActivity: string;
  lastPreview: string;
};

type GroupListRow = GroupRow & {
  lastActivity: string;
  lastPreview: string;
};

function sortGroupsByActivity(rows: GroupListRow[]): GroupListRow[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
}

type ConversationInsert = {
  id: string;
  participant_a: string;
  participant_b: string;
  created_at: string;
};

type MessageInsert = {
  id: string;
  conversation_id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
};

type GroupMessageInsert = {
  id: string;
  group_id: string;
  message_uuid: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
};

type GroupMemberInsert = {
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

function sortDmByActivity(rows: ConversationRow[]): ConversationRow[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
}

function sortInboxByActivity(rows: InboxItem[]): InboxItem[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
}

type InboxItem =
  | {
      kind: "dm";
      id: string;
      otherUserId: string;
      otherUsername: string;
      otherAvatarId: string | null;
      otherPublicKey: string;
      lastActivity: string;
      lastPreview: string;
    }
  | {
      kind: "group";
      id: string;
      name: string;
      avatarId: string | null;
      memberCount: number;
      lastActivity: string;
      lastPreview: string;
    };

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
  lastPreview,
  active,
  isLast,
}: {
  id: string;
  otherUsername: string;
  otherAvatarId: string | null;
  nickname: string | null;
  lastActivity: string;
  lastPreview: string;
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
          {lastPreview}
        </p>
      </div>
    </Link>
  );
});

const GroupRowItem = memo(function GroupRowItem({
  id,
  name,
  avatarId,
  lastActivity,
  lastPreview,
  active,
  isLast,
}: {
  id: string;
  name: string;
  avatarId: string | null;
  lastActivity: string;
  lastPreview: string;
  active: boolean;
  isLast: boolean;
}) {
  return (
    <Link
      href={`/chats/group/${id}`}
      className={`row-press flex min-h-[64px] min-w-0 items-center gap-[var(--sp-3)] px-[var(--sp-4)] ${
        active ? "bg-[var(--surface)]" : ""
      }`}
    >
      <GroupAvatar avatarId={avatarId} size={48} className="shrink-0" />
      <div
        className={`flex min-w-0 flex-1 flex-col justify-center self-stretch py-[var(--sp-3)] ${
          isLast ? "" : "border-b border-[var(--divider)]"
        }`}
      >
        <div className="flex items-baseline justify-between gap-[var(--sp-2)]">
          <p className="truncate text-[length:var(--text-body)] font-semibold text-[var(--text-primary)]">
            {name}
          </p>
          <span className="shrink-0 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
            {formatListTime(lastActivity)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
          {lastPreview}
        </p>
      </div>
    </Link>
  );
});

export function ChatList({
  activeConversationId,
  activeGroupId,
}: {
  activeConversationId?: string | null;
  activeGroupId?: string | null;
}) {
  const { avatarId } = useProfile();
  const { nicknames, loaded: nicknamesLoaded, loadNicknames } = useNicknames();
  const [composeOpen, setComposeOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [groups, setGroups] = useState<GroupListRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [listScrolled, setListScrolled] = useState(false);
  const [groupNotice, setGroupNotice] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef(conversations);
  const groupsRef = useRef(groups);
  const myUserIdRef = useRef<string | null>(null);
  const myPrivateKeyRef = useRef<string | null>(null);
  const otherPublicKeyByConvRef = useRef<Map<string, string>>(new Map());
  const pendingUpdateRef = useRef<
    Map<string, { lastActivity: string; lastPreview?: string }>
  >(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleListScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setListScrolled(el.scrollTop > 0);
  }, []);

  const flushPendingUpdates = useCallback(() => {
    const pending = pendingUpdateRef.current;
    if (pending.size === 0) return;
    pendingUpdateRef.current = new Map();
    setConversations((prev) => {
      const updated = prev.map((c) => {
        const next = pending.get(c.id);
        if (!next) return c;
        return {
          ...c,
          lastActivity: next.lastActivity,
          ...(next.lastPreview !== undefined
            ? { lastPreview: next.lastPreview }
            : {}),
        };
      });
      return sortDmByActivity(updated);
    });
    setGroups((prev) => {
      const updated = prev.map((g) => {
        const next = pending.get(g.id);
        if (!next) return g;
        return {
          ...g,
          lastActivity: next.lastActivity,
          ...(next.lastPreview !== undefined
            ? { lastPreview: next.lastPreview }
            : {}),
        };
      });
      return sortGroupsByActivity(updated);
    });
  }, []);

  const inboxItems = useMemo((): InboxItem[] => {
    const dm: InboxItem[] = conversations.map((c) => ({
      kind: "dm",
      id: c.id,
      otherUserId: c.otherUserId,
      otherUsername: c.otherUsername,
      otherAvatarId: c.otherAvatarId,
      otherPublicKey: c.otherPublicKey,
      lastActivity: c.lastActivity,
      lastPreview: c.lastPreview,
    }));
    const grp: InboxItem[] = groups.map((g) => ({
      kind: "group",
      id: g.id,
      name: g.name,
      avatarId: g.avatarId,
      memberCount: g.memberCount,
      lastActivity: g.lastActivity,
      lastPreview: g.lastPreview,
    }));
    return sortInboxByActivity([...dm, ...grp]);
  }, [conversations, groups]);

  const filteredInbox = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return inboxItems;
    return inboxItems.filter((item) => {
      if (item.kind === "group") {
        return item.name.toLowerCase().includes(q.toLowerCase());
      }
      return contactMatchesQuery(
        {
          username: item.otherUsername,
          nickname: nicknames[item.otherUserId] ?? null,
        },
        q,
      );
    });
  }, [inboxItems, nicknames, searchQuery]);

  useEffect(() => {
    const notice = consumeGroupNotice();
    if (notice) {
      setGroupNotice(notice);
      const timer = setTimeout(() => setGroupNotice(null), 4000);
      return () => clearTimeout(timer);
    }
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
    groupsRef.current = groups;
  }, [groups]);

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

      let myPrivateKey: string | null = null;
      if (await hasPrivateKey(user.id)) {
        myPrivateKey = await loadPrivateKey(user.id);
        myPrivateKeyRef.current = myPrivateKey;
      }

      const [convRows, groupRows] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, participant_a, participant_b, created_at")
          .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          }),
        fetchMyGroups(user.id),
      ]);

      await loadNicknames();

      const prevGroupById = new Map(
        groupsRef.current.map((g) => [
          g.id,
          { lastActivity: g.lastActivity, lastPreview: g.lastPreview },
        ]),
      );

      const nextGroups = await Promise.all(
        groupRows.map(async (g) => {
          const prior = prevGroupById.get(g.id);
          let lastActivity = prior?.lastActivity ?? g.createdAt;
          let lastPreview = prior?.lastPreview ?? "No messages yet";

          if (myPrivateKey) {
            try {
              const preview = await fetchGroupPreview(
                g.id,
                user.id,
                myPrivateKey,
                g.createdAt,
              );
              lastActivity = preview.lastActivity;
              lastPreview = preview.lastPreview;
            } catch {
              lastPreview = "Encrypted message";
            }
          }

          return {
            ...g,
            lastActivity,
            lastPreview,
          };
        }),
      );

      setGroups(sortGroupsByActivity(nextGroups));

      if (!convRows || convRows.length === 0) {
        setConversations([]);
        return;
      }

      const otherIds = convRows.map((row) =>
        row.participant_a === user.id ? row.participant_b : row.participant_a,
      );

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, avatar_id, public_key")
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
            public_key: (p.public_key as string) ?? "",
          },
        ]),
      );

      const prevById = new Map(
        conversationsRef.current.map((c) => [
          c.id,
          { lastActivity: c.lastActivity, lastPreview: c.lastPreview },
        ]),
      );

      const next = await Promise.all(
        convRows.map(async (row) => {
          const otherId =
            row.participant_a === user.id
              ? row.participant_b
              : row.participant_a;
          const profile = profileById.get(otherId as string);
          const createdAt = row.created_at as string;
          const prior = prevById.get(row.id as string);
          const lastActivity =
            prior &&
            new Date(prior.lastActivity).getTime() > new Date(createdAt).getTime()
              ? prior.lastActivity
              : createdAt;

          const otherPublicKey = profile?.public_key ?? "";
          otherPublicKeyByConvRef.current.set(row.id as string, otherPublicKey);

          let lastPreview = prior?.lastPreview ?? "Encrypted message";
          if (
            myPrivateKey &&
            otherPublicKey &&
            (!prior?.lastPreview || prior.lastActivity !== lastActivity)
          ) {
            try {
              lastPreview = await fetchConversationPreview(
                row.id as string,
                otherPublicKey,
                myPrivateKey,
              );
            } catch {
              lastPreview = "Encrypted message";
            }
          }

          return {
            id: row.id as string,
            otherUserId: otherId as string,
            otherUsername: profile?.username ?? "unknown",
            otherAvatarId: profile?.avatar_id ?? null,
            otherPublicKey,
            lastActivity,
            lastPreview,
          };
        }),
      );

      setConversations(sortDmByActivity(next));
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
        .select("username, avatar_id, public_key")
        .eq("id", otherId)
        .maybeSingle();

      const otherPublicKey = (profile?.public_key as string) ?? "";
      otherPublicKeyByConvRef.current.set(row.id, otherPublicKey);

      setConversations((prev) => {
        if (prev.some((c) => c.id === row.id)) return prev;
        return sortDmByActivity([
          {
            id: row.id,
            otherUserId: otherId,
            otherUsername: (profile?.username as string) ?? "unknown",
            otherAvatarId: (profile?.avatar_id as string | null) ?? null,
            otherPublicKey,
            lastActivity: row.created_at,
            lastPreview: "Encrypted message",
          },
          ...prev,
        ]);
      });
    },
    [],
  );

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

      if (await hasPrivateKey(user.id)) {
        myPrivateKeyRef.current = await loadPrivateKey(user.id);
      }

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

            void (async () => {
              const myPrivateKey = myPrivateKeyRef.current;
              const otherPublicKey = otherPublicKeyByConvRef.current.get(
                row.conversation_id,
              );
              let lastPreview: string | undefined;
              if (myPrivateKey && otherPublicKey) {
                try {
                  lastPreview = await previewFromMessageRow(
                    row as EncryptedMessageRow,
                    otherPublicKey,
                    myPrivateKey,
                  );
                } catch {
                  // Keep existing preview on decrypt failure.
                }
              }

              const currentPending = pendingUpdateRef.current.get(
                row.conversation_id,
              );
              if (
                !currentPending ||
                new Date(row.created_at).getTime() >=
                  new Date(currentPending.lastActivity).getTime()
              ) {
                pendingUpdateRef.current.set(row.conversation_id, {
                  lastActivity: row.created_at,
                  ...(lastPreview !== undefined ? { lastPreview } : {}),
                });
              }

              if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(() => {
                  flushTimerRef.current = null;
                  flushPendingUpdates();
                }, 120);
              }
            })();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_messages",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as GroupMessageInsert;
            if (!row?.group_id || !row.created_at) return;

            const known = groupsRef.current.some((g) => g.id === row.group_id);

            if (!known) {
              void loadConversations();
              return;
            }

            void (async () => {
              const myPrivateKey = myPrivateKeyRef.current;
              let lastPreview: string | undefined;
              if (myPrivateKey) {
                try {
                  const supabase = createClient();
                  const { data: senderProfile } = await supabase
                    .from("profiles")
                    .select("public_key")
                    .eq("id", row.sender_id)
                    .maybeSingle();

                  lastPreview = await previewFromGroupMessageRow(
                    row as GroupMessageRow,
                    (senderProfile?.public_key as string | null) ?? null,
                    myPrivateKey,
                  );
                } catch {
                  // Keep existing preview on decrypt failure.
                }
              }

              const currentPending = pendingUpdateRef.current.get(row.group_id);
              if (
                !currentPending ||
                new Date(row.created_at).getTime() >=
                  new Date(currentPending.lastActivity).getTime()
              ) {
                pendingUpdateRef.current.set(row.group_id, {
                  lastActivity: row.created_at,
                  ...(lastPreview !== undefined ? { lastPreview } : {}),
                });
              }

              if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(() => {
                  flushTimerRef.current = null;
                  flushPendingUpdates();
                }, 120);
              }
            })();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_members",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as GroupMemberInsert;
            if (!row?.group_id) return;

            if (groupsRef.current.some((g) => g.id === row.group_id)) {
              return;
            }

            void (async () => {
              const group = await fetchGroupForInbox(row.group_id, user.id);
              if (!group) return;

              setGroups((prev) => {
                if (prev.some((g) => g.id === group.id)) return prev;
                return sortGroupsByActivity([
                  {
                    ...group,
                    lastActivity: group.createdAt,
                    lastPreview: "No messages yet",
                  },
                  ...prev,
                ]);
              });
            })();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "group_members",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.old as GroupMemberInsert;
            if (!row?.group_id) return;
            setGroups((prev) => prev.filter((g) => g.id !== row.group_id));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "groups",
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              name: string;
              avatar: string | null;
            };
            if (!row?.id) return;
            if (!groupsRef.current.some((g) => g.id === row.id)) return;
            setGroups((prev) =>
              prev.map((g) =>
                g.id === row.id
                  ? { ...g, name: row.name, avatarId: row.avatar }
                  : g,
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
  }, [loadConversations, upsertConversationFromRow, flushPendingUpdates]);

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
                activeGroupId
                  ? `/settings?returnTo=${encodeURIComponent(`/chats/group/${activeGroupId}`)}`
                  : activeConversationId
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

      {groupNotice ? (
        <div className="shrink-0 border-b border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] py-[var(--sp-2)]">
          <p className="text-center text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
            {groupNotice}
          </p>
        </div>
      ) : null}

      {myUserId ? <WrapSetupBanner userId={myUserId} /> : null}

      {!showLoading && inboxItems.length > 0 ? (
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
            ) : inboxItems.length === 0 ? (
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
            ) : filteredInbox.length === 0 ? (
              <p className="px-[var(--sp-4)] py-[var(--sp-6)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                No matches.
              </p>
            ) : (
              <ul className="pb-[var(--sp-8)]">
                {filteredInbox.map((item, index) => (
                  <li key={`${item.kind}-${item.id}`}>
                    {item.kind === "group" ? (
                      <GroupRowItem
                        id={item.id}
                        name={item.name}
                        avatarId={item.avatarId}
                        lastActivity={item.lastActivity}
                        lastPreview={item.lastPreview}
                        active={activeGroupId === item.id}
                        isLast={index === filteredInbox.length - 1}
                      />
                    ) : (
                      <ConversationRowItem
                        id={item.id}
                        otherUsername={item.otherUsername}
                        otherAvatarId={item.otherAvatarId}
                        nickname={nicknames[item.otherUserId] ?? null}
                        lastActivity={item.lastActivity}
                        lastPreview={item.lastPreview}
                        active={activeConversationId === item.id}
                        isLast={index === filteredInbox.length - 1}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <NewChatModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onInboxChanged={() => void loadConversations()}
      />
    </div>
  );
}
