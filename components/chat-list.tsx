"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NewChatModal } from "@/components/new-chat-modal";
import { GroupAvatar } from "@/components/group-avatar";
import { PencilIcon, PeopleIcon, SearchIcon } from "@/components/icons";
import { useNicknames } from "@/components/nicknames-context";
import { useProfile } from "@/components/profile-context";
import { fetchConversationPreview, previewFromMessageRow } from "@/lib/conversationPreview";
import { contactMatchesQuery, displayName } from "@/lib/display-name";
import { hasPrivateKey, loadPrivateKey } from "@/lib/keystore";
import type { EncryptedMessageRow } from "@/lib/message-decrypt";
import { fetchMyGroups, fetchGroupForInbox, fetchLeftGroupRemnants, type GroupRow } from "@/lib/groups";
import { consumeGroupNotice } from "@/lib/groupNotice";
import { WrapSetupBanner } from "@/components/wrap-setup-banner";
import { DeleteConversationDialog } from "@/components/delete-conversation-dialog";
import {
  clearedAtFor,
  fetchConversationClearsMap,
  isVisibleInInbox,
  markConversationCleared,
  attachmentCacheScope,
} from "@/lib/conversationClear";
import { purgeConversationAttachmentCache } from "@/lib/attachmentCache";
import {
  fetchGroupPreview,
  previewFromGroupMessageRow,
  type GroupMessageRow,
} from "@/lib/groupMessages";
import { Avatar } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
  fetchUnreadCounts,
  unreadCountMapFromRows,
  unreadMapKey,
} from "@/lib/readState";

type ConversationRow = {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherAvatarId: string | null;
  otherPublicKey: string;
  lastActivity: string;
  lastPreview: string;
  lastSenderId: string | null;
  lastMessageId?: string;
  unreadCount: number;
};

type GroupListRow = GroupRow & {
  lastActivity: string;
  lastPreview: string;
  lastSenderId: string | null;
  lastSenderUsername: string | null;
  lastMessageId?: string;
  unreadCount: number;
  isLeft?: boolean;
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
  edit_of?: string | null;
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
  edit_of?: string | null;
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
      lastSenderId: string | null;
      unreadCount: number;
    }
  | {
      kind: "group";
      id: string;
      name: string;
      avatarId: string | null;
      memberCount: number;
      lastActivity: string;
      lastPreview: string;
      lastSenderId: string | null;
      lastSenderUsername: string | null;
      unreadCount: number;
      isLeft?: boolean;
    };

/** Inbox timestamp: time today, weekday within 7 days, else locale date. */
function formatInboxTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
      (startToday.getTime() - startMsg.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays === 0) {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    if (diffDays > 0 && diffDays < 7) {
      return d.toLocaleDateString(undefined, { weekday: "short" });
    }
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "";
  }
}

function previewFirstName(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed.slice(1) || trimmed;
  return trimmed.split(/\s+/)[0] || trimmed;
}

function formatInboxPreviewLine({
  preview,
  myUserId,
  lastSenderId,
  isGroup,
  senderLabel,
}: {
  preview: string;
  myUserId: string | null;
  lastSenderId: string | null;
  isGroup: boolean;
  senderLabel?: string | null;
}): string {
  if (!preview || preview === "No messages yet") return preview;
  if (lastSenderId && myUserId && lastSenderId === myUserId) {
    return `You: ${preview}`;
  }
  if (isGroup && lastSenderId && senderLabel) {
    return `${previewFirstName(senderLabel)}: ${preview}`;
  }
  return preview;
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="inline-flex h-[var(--unread-badge-size)] min-w-[var(--unread-badge-size)] items-center justify-center rounded-[10px] bg-[var(--accent)] px-1.5 text-[12px] font-semibold leading-none text-white"
      aria-hidden
    >
      {label}
    </span>
  );
}

function ListSkeleton() {
  return (
    <ul className="pb-[var(--sp-8)]" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <li
          key={i}
          className="flex h-[var(--inbox-row-height)] items-center gap-[var(--sp-3)] px-[var(--sp-4)]"
        >
          <div className="h-[var(--inbox-avatar-size)] w-[var(--inbox-avatar-size)] shrink-0 rounded-full skeleton-shimmer" />
          <div className="min-w-0 flex-1 space-y-[var(--sp-2)]">
            <div className="h-4 w-[55%] rounded skeleton-shimmer" />
            <div className="h-3.5 w-[75%] rounded skeleton-shimmer" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PullRefreshSpinner({
  progress,
  refreshing,
}: {
  progress: number;
  refreshing: boolean;
}) {
  const opacity = refreshing ? 1 : Math.min(1, progress);
  if (opacity <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-[var(--sp-2)]"
      style={{ opacity }}
      aria-hidden
    >
      <svg
        className={`h-5 w-5 text-[var(--text-secondary)] ${refreshing ? "animate-spin" : ""}`}
        style={
          refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }
        }
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.25"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function useLongPress(onLongPress: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return {
    onTouchStart: () => {
      timerRef.current = setTimeout(onLongPress, 500);
    },
    onTouchEnd: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    onTouchMove: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress();
    },
  };
}

const ConversationRowItem = memo(function ConversationRowItem({
  id,
  otherUsername,
  otherAvatarId,
  nickname,
  lastActivity,
  lastPreview,
  lastSenderId,
  myUserId,
  unreadCount,
  active,
  showSeparator,
  onDeleteRequest,
}: {
  id: string;
  otherUsername: string;
  otherAvatarId: string | null;
  nickname: string | null;
  lastActivity: string;
  lastPreview: string;
  lastSenderId: string | null;
  myUserId: string | null;
  unreadCount: number;
  active: boolean;
  showSeparator: boolean;
  onDeleteRequest?: () => void;
}) {
  const label = displayName({ username: otherUsername, nickname });
  const unread = unreadCount > 0;
  const longPress = useLongPress(() => onDeleteRequest?.());
  const preview = formatInboxPreviewLine({
    preview: lastPreview,
    myUserId,
    lastSenderId,
    isGroup: false,
  });
  const timeLabel = formatInboxTimestamp(lastActivity);
  const ariaLabel = unread
    ? `${label}, ${preview}, ${timeLabel}, ${unreadCount} unread messages`
    : `${label}, ${preview}, ${timeLabel}`;

  return (
    <Link
      href={`/chats/${id}`}
      aria-label={ariaLabel}
      className={`row-press flex h-[var(--inbox-row-height)] min-w-0 items-center gap-[var(--sp-3)] px-[var(--sp-4)] ${
        active ? "bg-[var(--surface)]" : ""
      }`}
      {...(onDeleteRequest ? longPress : {})}
    >
      <Avatar
        avatarId={otherAvatarId}
        size={52}
        className="shrink-0"
      />
      <div
        className={`flex min-h-0 min-w-0 flex-1 items-start gap-[var(--sp-3)] self-stretch py-[14px] ${
          showSeparator ? "border-b border-[var(--row-separator)]" : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch">
          <p
            className={`truncate text-[16px] font-semibold leading-tight text-[var(--text-primary)]`}
          >
            {label}
          </p>
          <p
            className={`truncate text-[14px] leading-tight ${
              unread
                ? "font-medium text-[var(--text-primary)]"
                : "font-normal text-[var(--text-preview)]"
            }`}
          >
            {preview}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <span className="text-[13px] leading-none text-[var(--text-secondary)]">
            {timeLabel}
          </span>
          <UnreadBadge count={unreadCount} />
        </div>
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
  lastSenderId,
  lastSenderUsername,
  senderNickname,
  myUserId,
  unreadCount,
  active,
  showSeparator,
  isLeft,
  onDeleteRequest,
}: {
  id: string;
  name: string;
  avatarId: string | null;
  lastActivity: string;
  lastPreview: string;
  lastSenderId: string | null;
  lastSenderUsername: string | null;
  senderNickname: string | null;
  myUserId: string | null;
  unreadCount: number;
  active: boolean;
  showSeparator: boolean;
  isLeft?: boolean;
  onDeleteRequest?: () => void;
}) {
  const unread = unreadCount > 0;
  const longPress = useLongPress(() => onDeleteRequest?.());
  const senderLabel =
    lastSenderUsername != null
      ? displayName({
          username: lastSenderUsername,
          nickname: senderNickname,
        })
      : null;
  const preview = formatInboxPreviewLine({
    preview: lastPreview,
    myUserId,
    lastSenderId,
    isGroup: true,
    senderLabel,
  });
  const timeLabel = formatInboxTimestamp(lastActivity);
  const ariaLabel = unread
    ? `${name}, ${preview}, ${timeLabel}, ${unreadCount} unread messages`
    : `${name}, ${preview}, ${timeLabel}`;

  return (
    <Link
      href={`/chats/group/${id}`}
      aria-label={ariaLabel}
      className={`row-press flex h-[var(--inbox-row-height)] min-w-0 items-center gap-[var(--sp-3)] px-[var(--sp-4)] ${
        active ? "bg-[var(--surface)]" : ""
      }`}
      {...(isLeft && onDeleteRequest ? longPress : {})}
    >
      <GroupAvatar avatarId={avatarId} size={52} className="shrink-0" />
      <div
        className={`flex min-h-0 min-w-0 flex-1 items-start gap-[var(--sp-3)] self-stretch py-[14px] ${
          showSeparator ? "border-b border-[var(--row-separator)]" : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch">
          <p className="truncate text-[16px] font-semibold leading-tight text-[var(--text-primary)]">
            {name}
          </p>
          <p
            className={`truncate text-[14px] leading-tight ${
              unread
                ? "font-medium text-[var(--text-primary)]"
                : "font-normal text-[var(--text-preview)]"
            }`}
          >
            {preview}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <span className="text-[13px] leading-none text-[var(--text-secondary)]">
            {timeLabel}
          </span>
          <UnreadBadge count={unreadCount} />
        </div>
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
  const { avatarId, refreshProfile } = useProfile();
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
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "dm" | "group";
    id: string;
    peerName: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef(conversations);
  const groupsRef = useRef(groups);
  const myUserIdRef = useRef<string | null>(null);
  const myPrivateKeyRef = useRef<string | null>(null);
  const otherPublicKeyByConvRef = useRef<Map<string, string>>(new Map());
  const activeConversationIdRef = useRef<string | null>(
    activeConversationId ?? null,
  );
  const activeGroupIdRef = useRef<string | null>(activeGroupId ?? null);
  const pendingUpdateRef = useRef<
    Map<
      string,
      {
        lastActivity: string;
        lastPreview?: string;
        lastSenderId?: string | null;
        lastSenderUsername?: string | null;
      }
    >
  >(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleListScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setListScrolled(el.scrollTop > 0);
  }, []);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId ?? null;
  }, [activeConversationId]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId ?? null;
  }, [activeGroupId]);

  // Open conversation → local unread clears immediately (DB write is in the room).
  useEffect(() => {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId ? { ...c, unreadCount: 0 } : c,
      ),
    );
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeGroupId) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === activeGroupId ? { ...g, unreadCount: 0 } : g,
      ),
    );
  }, [activeGroupId]);

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
          ...(next.lastSenderId !== undefined
            ? { lastSenderId: next.lastSenderId }
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
          ...(next.lastSenderId !== undefined
            ? { lastSenderId: next.lastSenderId }
            : {}),
          ...(next.lastSenderUsername !== undefined
            ? { lastSenderUsername: next.lastSenderUsername }
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
      lastSenderId: c.lastSenderId,
      unreadCount: c.unreadCount,
    }));
    const grp: InboxItem[] = groups.map((g) => ({
      kind: "group",
      id: g.id,
      name: g.name,
      avatarId: g.avatarId,
      memberCount: g.memberCount,
      lastActivity: g.lastActivity,
      lastPreview: g.lastPreview,
      lastSenderId: g.lastSenderId,
      lastSenderUsername: g.lastSenderUsername,
      unreadCount: g.unreadCount,
      isLeft: g.isLeft,
    }));
    return sortInboxByActivity([...dm, ...grp]);
  }, [conversations, groups]);

  const totalUnread = useMemo(
    () => inboxItems.reduce((sum, item) => sum + item.unreadCount, 0),
    [inboxItems],
  );

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

      const [convRows, groupRows, leftRemnants, clearsMap] = await Promise.all([
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
        fetchLeftGroupRemnants(user.id),
        fetchConversationClearsMap(),
      ]);

      const activeGroupIds = new Set(groupRows.map((g) => g.id));
      const mergedGroupRows = [
        ...groupRows,
        ...leftRemnants.filter((g) => !activeGroupIds.has(g.id)),
      ];

      await loadNicknames();

      const prevGroupById = new Map(
        groupsRef.current.map((g) => [
          g.id,
          {
            lastActivity: g.lastActivity,
            lastPreview: g.lastPreview,
            lastSenderId: g.lastSenderId,
            lastSenderUsername: g.lastSenderUsername,
            lastMessageId: g.lastMessageId,
            unreadCount: g.unreadCount,
          },
        ]),
      );

      const nextGroups = (
        await Promise.all(
          mergedGroupRows.map(async (g): Promise<GroupListRow | null> => {
          const prior = prevGroupById.get(g.id);
          const groupCleared = clearedAtFor(clearsMap, "group", g.id);
          let lastActivity = prior?.lastActivity ?? g.createdAt;
          let lastPreview = prior?.lastPreview ?? "No messages yet";
          let lastSenderId = prior?.lastSenderId ?? null;
          let lastSenderUsername = prior?.lastSenderUsername ?? null;
          let lastMessageId = prior?.lastMessageId;

          if (myPrivateKey) {
            try {
              const preview = await fetchGroupPreview(
                g.id,
                user.id,
                myPrivateKey,
                g.createdAt,
                groupCleared,
              );
              if (!preview) return null;
              lastActivity = preview.lastActivity;
              lastPreview = preview.lastPreview;
              lastSenderId = preview.lastSenderId;
              lastSenderUsername = preview.lastSenderUsername;
              lastMessageId = preview.lastMessageId;
            } catch {
              lastPreview = "Encrypted message";
            }
          }

          if (!isVisibleInInbox(lastActivity, groupCleared)) {
            return null;
          }

          const row: GroupListRow = {
            ...g,
            lastActivity,
            lastPreview,
            lastSenderId,
            lastSenderUsername,
            lastMessageId,
            unreadCount: prior?.unreadCount ?? 0,
          };
          if ("isLeft" in g && g.isLeft) {
            row.isLeft = true;
          }
          return row;
        }),
        )
      ).filter((row): row is GroupListRow => row !== null);

      let nextConversations: ConversationRow[] = [];

      if (convRows && convRows.length > 0) {
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
            {
              lastActivity: c.lastActivity,
              lastPreview: c.lastPreview,
              lastSenderId: c.lastSenderId,
              unreadCount: c.unreadCount,
            },
          ]),
        );

        nextConversations = (
          await Promise.all(
            convRows.map(async (row): Promise<ConversationRow | null> => {
            const otherId =
              row.participant_a === user.id
                ? row.participant_b
                : row.participant_a;
            const profile = profileById.get(otherId as string);
            const createdAt = row.created_at as string;
            const prior = prevById.get(row.id as string);
            const dmCleared = clearedAtFor(clearsMap, "dm", row.id as string);

            const otherPublicKey = profile?.public_key ?? "";
            otherPublicKeyByConvRef.current.set(
              row.id as string,
              otherPublicKey,
            );

            let lastPreview = prior?.lastPreview ?? "Encrypted message";
            let lastSenderId = prior?.lastSenderId ?? null;
            let lastActivity = createdAt;
            let lastMessageId: string | undefined;

            if (myPrivateKey && otherPublicKey) {
              try {
                const preview = await fetchConversationPreview(
                  row.id as string,
                  otherPublicKey,
                  myPrivateKey,
                  dmCleared,
                );
                if (!preview) return null;
                lastPreview = preview.text;
                lastSenderId = preview.senderId;
                lastActivity = preview.lastActivity;
                lastMessageId = preview.lastMessageId;
              } catch {
                lastPreview = "Encrypted message";
              }
            } else if (prior && isVisibleInInbox(prior.lastActivity, dmCleared)) {
              lastActivity =
                new Date(prior.lastActivity).getTime() >
                new Date(createdAt).getTime()
                  ? prior.lastActivity
                  : createdAt;
              lastPreview = prior.lastPreview;
              lastSenderId = prior.lastSenderId;
            } else if (!isVisibleInInbox(createdAt, dmCleared)) {
              return null;
            }

            if (!isVisibleInInbox(lastActivity, dmCleared)) {
              return null;
            }

            return {
              id: row.id as string,
              otherUserId: otherId as string,
              otherUsername: profile?.username ?? "unknown",
              otherAvatarId: profile?.avatar_id ?? null,
              otherPublicKey,
              lastActivity,
              lastPreview,
              lastSenderId,
              unreadCount: prior?.unreadCount ?? 0,
              ...(lastMessageId ? { lastMessageId } : {}),
            };
          }),
          )
        ).filter((row): row is ConversationRow => row !== null);
      }

      const unreadRows = await fetchUnreadCounts();
      const unreadMap = unreadCountMapFromRows(unreadRows);

      setGroups(
        sortGroupsByActivity(
          nextGroups.map((g) => ({
            ...g,
            unreadCount:
              activeGroupIdRef.current === g.id
                ? 0
                : (unreadMap.get(unreadMapKey("group", g.id)) ?? 0),
          })),
        ),
      );
      setConversations(
        sortDmByActivity(
          nextConversations.map((c) => ({
            ...c,
            unreadCount:
              activeConversationIdRef.current === c.id
                ? 0
                : (unreadMap.get(unreadMapKey("dm", c.id)) ?? 0),
          })),
        ),
      );
    } catch {
      setListError("Could not load conversations.");
    } finally {
      setLoadingList(false);
    }
  }, [loadNicknames]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([loadConversations(), refreshProfile()]);
  }, [loadConversations, refreshProfile]);

  const confirmDeleteConversation = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await markConversationCleared(
        deleteTarget.kind,
        deleteTarget.id,
      );
      if (!result.ok) {
        setListError(result.error);
        return;
      }
      purgeConversationAttachmentCache(
        attachmentCacheScope(deleteTarget.kind, deleteTarget.id),
      );
      if (deleteTarget.kind === "dm") {
        setConversations((prev) =>
          prev.filter((c) => c.id !== deleteTarget.id),
        );
      } else {
        setGroups((prev) => prev.filter((g) => g.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const {
    contentStyle: pullContentStyle,
    progress: pullProgress,
    refreshing: pullRefreshing,
  } = usePullToRefresh(scrollRef, handlePullRefresh, !loadingList);

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
            lastSenderId: null,
            unreadCount: 0,
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
              const conv = conversationsRef.current.find(
                (c) => c.id === row.conversation_id,
              );

              if (row.edit_of) {
                if (conv?.lastMessageId !== row.edit_of) return;

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

                if (lastPreview !== undefined && conv) {
                  pendingUpdateRef.current.set(row.conversation_id, {
                    lastActivity: conv.lastActivity,
                    lastPreview,
                    lastSenderId: conv.lastSenderId,
                  });
                  if (!flushTimerRef.current) {
                    flushTimerRef.current = setTimeout(() => {
                      flushTimerRef.current = null;
                      flushPendingUpdates();
                    }, 120);
                  }
                }
                return;
              }

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
                  lastSenderId: row.sender_id,
                });
              }

              if (
                row.sender_id !== user.id &&
                row.conversation_id !== activeConversationIdRef.current
              ) {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === row.conversation_id
                      ? {
                          ...c,
                          unreadCount: c.unreadCount + 1,
                          lastMessageId: row.id,
                        }
                      : c,
                  ),
                );
              } else if (row.sender_id === user.id) {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === row.conversation_id
                      ? { ...c, lastMessageId: row.id }
                      : c,
                  ),
                );
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
              const grp = groupsRef.current.find((g) => g.id === row.group_id);

              if (row.edit_of) {
                if (grp?.lastMessageId !== row.edit_of) return;

                const myPrivateKey = myPrivateKeyRef.current;
                let lastPreview: string | undefined;
                if (myPrivateKey) {
                  try {
                    const client = createClient();
                    const { data: senderProfile } = await client
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

                if (lastPreview !== undefined && grp) {
                  pendingUpdateRef.current.set(row.group_id, {
                    lastActivity: grp.lastActivity,
                    lastPreview,
                    lastSenderId: grp.lastSenderId,
                    lastSenderUsername: grp.lastSenderUsername,
                  });
                  if (!flushTimerRef.current) {
                    flushTimerRef.current = setTimeout(() => {
                      flushTimerRef.current = null;
                      flushPendingUpdates();
                    }, 120);
                  }
                }
                return;
              }

              const myPrivateKey = myPrivateKeyRef.current;
              let lastPreview: string | undefined;
              let lastSenderUsername: string | null | undefined;

              if (myPrivateKey) {
                try {
                  const client = createClient();
                  const { data: senderProfile } = await client
                    .from("profiles")
                    .select("public_key, username")
                    .eq("id", row.sender_id)
                    .maybeSingle();

                  lastPreview = await previewFromGroupMessageRow(
                    row as GroupMessageRow,
                    (senderProfile?.public_key as string | null) ?? null,
                    myPrivateKey,
                  );
                  lastSenderUsername =
                    (senderProfile?.username as string | null) ?? null;
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
                  lastSenderId: row.sender_id,
                  ...(lastSenderUsername !== undefined
                    ? { lastSenderUsername }
                    : {}),
                });
              }

              if (
                row.sender_id !== user.id &&
                row.group_id !== activeGroupIdRef.current
              ) {
                setGroups((prev) =>
                  prev.map((g) =>
                    g.id === row.group_id
                      ? {
                          ...g,
                          unreadCount: g.unreadCount + 1,
                          lastMessageId: row.message_uuid,
                        }
                      : g,
                  ),
                );
              } else if (row.sender_id === user.id) {
                setGroups((prev) =>
                  prev.map((g) =>
                    g.id === row.group_id
                      ? { ...g, lastMessageId: row.message_uuid }
                      : g,
                  ),
                );
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
                    lastSenderId: null,
                    lastSenderUsername: null,
                    unreadCount: 0,
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
            void loadConversations();
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
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-[var(--bg)] screen-enter"
      data-total-unread={totalUnread}
    >
      <header
        className={`safe-pt shrink-0 bg-[var(--bg)] transition-[border-color] duration-150 ${
          listScrolled ? "border-b border-[var(--divider)]" : "border-b border-transparent"
        }`}
      >
        <div className="flex h-[52px] items-center justify-between px-[var(--sp-4)]">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
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
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <PullRefreshSpinner
          progress={pullProgress}
          refreshing={pullRefreshing}
        />
        <div style={pullContentStyle}>
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
                style={{ paddingTop: "min(36vh, 240px)" }}
              >
                <span
                  className="mb-[var(--sp-4)] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-secondary)]"
                  aria-hidden
                >
                  <PeopleIcon className="h-7 w-7" />
                </span>
                <p className="text-[16px] font-semibold text-[var(--text-primary)]">
                  No conversations yet
                </p>
                <p className="mt-[var(--sp-1)] max-w-[240px] text-[14px] leading-[1.4] text-[var(--text-secondary)]">
                  Tap the compose button above to start a private chat.
                </p>
              </div>
            ) : filteredInbox.length === 0 ? (
              <p className="px-[var(--sp-4)] py-[var(--sp-6)] text-[14px] text-[var(--text-secondary)]">
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
                        lastSenderId={item.lastSenderId}
                        lastSenderUsername={item.lastSenderUsername}
                        senderNickname={
                          item.lastSenderId
                            ? (nicknames[item.lastSenderId] ?? null)
                            : null
                        }
                        myUserId={myUserId}
                        unreadCount={item.unreadCount}
                        active={activeGroupId === item.id}
                        showSeparator={index !== filteredInbox.length - 1}
                        isLeft={item.isLeft}
                        onDeleteRequest={
                          item.isLeft
                            ? () =>
                                setDeleteTarget({
                                  kind: "group",
                                  id: item.id,
                                  peerName: item.name,
                                })
                            : undefined
                        }
                      />
                    ) : (
                      <ConversationRowItem
                        id={item.id}
                        otherUsername={item.otherUsername}
                        otherAvatarId={item.otherAvatarId}
                        nickname={nicknames[item.otherUserId] ?? null}
                        lastActivity={item.lastActivity}
                        lastPreview={item.lastPreview}
                        lastSenderId={item.lastSenderId}
                        myUserId={myUserId}
                        unreadCount={item.unreadCount}
                        active={activeConversationId === item.id}
                        showSeparator={index !== filteredInbox.length - 1}
                        onDeleteRequest={() =>
                          setDeleteTarget({
                            kind: "dm",
                            id: item.id,
                            peerName: displayName({
                              username: item.otherUsername,
                              nickname: nicknames[item.otherUserId] ?? null,
                            }),
                          })
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        </div>
      </div>

      <NewChatModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onInboxChanged={() => void loadConversations()}
      />

      {deleteTarget ? (
        <DeleteConversationDialog
          peerName={deleteTarget.peerName}
          confirming={deleting}
          onConfirm={() => void confirmDeleteConversation()}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
