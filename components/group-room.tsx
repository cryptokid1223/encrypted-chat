"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatComposer, type VoiceRecordingPayload } from "@/components/chat-composer";
import { GroupAvatar } from "@/components/group-avatar";
import { DeleteForEveryoneDialog } from "@/components/delete-message-dialog";
import { GroupInfo } from "@/components/group-info";
import { ChevronLeftIcon } from "@/components/icons";
import { useKeyGate } from "@/components/key-gate";
import { MessageBubble, SystemPill } from "@/components/message-bubble";
import { PhotoViewerHostProvider } from "@/components/photo-viewer-host";
import { useNicknames } from "@/components/nicknames-context";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useConversationAnchoring } from "@/hooks/useConversationAnchoring";
import {
  markReadIfVisible,
  useMarkConversationRead,
} from "@/hooks/useMarkConversationRead";
import {
  GROUP_FETCH_LIMIT,
  PAGE_SIZE,
  captureScrollAnchor,
  chronologicalAsc,
  cursorFromOldestRow,
  olderThanOrFilter,
  restoreScrollAnchor,
  takeUniqueGroupRowsByUuid,
  type HistoryCursor,
  type ScrollAnchor,
} from "@/hooks/messagePagination";
import { uploadEncryptedAttachment } from "@/lib/attachmentStorage";
import { isSameCalendarDay } from "@/lib/chat";
import { encryptMessage } from "@/lib/crypto";
import { displayName } from "@/lib/display-name";
import { setGroupNotice } from "@/lib/groupNotice";
import { encryptFile } from "@/lib/fileCrypto";
import {
  decryptGroupMessageBatch,
  decryptGroupMessageRow,
  type GroupMessageRow,
} from "@/lib/groupMessages";
import {
  fetchGroupMembersWithKeys,
  fetchGroupShell,
  type GroupMemberWithKey,
} from "@/lib/groups";
import {
  ImageTooLargeError,
  processImageForSend,
  processVideoForSend,
  VideoTooLargeError,
  VideoUnsupportedError,
} from "@/lib/imageProcessing";
import { hasPrivateKey, loadPrivateKey } from "@/lib/keystore";
import { applyAfterClear, attachmentCacheScope, fetchClearedAt } from "@/lib/conversationClear";
import { buildAttachmentBody, parseMessageBody } from "@/lib/messageContent";
import {
  applyIncomingDelete,
  applyIncomingEdit,
  buildDeleteEnvelopeBody,
  buildEditBody,
  canDeleteForEveryone,
  canEditMessage,
  deleteMetaFromMessage,
  editMetaFromMessage,
  integrateMessageBatch,
  mergeMessagesWithEdits,
  purgeAttachmentsForBody,
  removeMessageById,
  type PendingMutations,
} from "@/lib/messageEdits";
import { fetchMessageHides, markMessageHidden } from "@/lib/messageHide";
import { createClient } from "@/lib/supabase/client";
import { stopVoicePlayback } from "@/lib/voicePlayer";
import { InlineSpinner } from "@/components/inline-spinner";

type DisplayMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  editOf?: string | null;
  deleteOf?: string | null;
  edited?: boolean;
  deleted?: boolean;
  editAppliedAt?: string;
  deleteAppliedAt?: string;
  failed?: boolean;
  decryptFailed?: boolean;
  localPreviewUrl?: string;
  pendingAttachment?: Pick<
    import("@/lib/fileCrypto").AttachmentMeta,
    "kind" | "w" | "h" | "durationMs"
  >;
};

const GROUP_MESSAGE_SELECT =
  "id, group_id, message_uuid, sender_id, recipient_id, ciphertext, nonce, created_at, edit_of, delete_of";

const emptyPending = (): PendingMutations<DisplayMessage> => ({
  pendingEdits: new Map(),
  pendingDeletes: new Map(),
});

function toDisplayMessage(m: {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  editOf?: string | null;
  deleteOf?: string | null;
  decryptFailed?: boolean;
}): DisplayMessage {
  return {
    id: m.id,
    senderId: m.senderId,
    body: m.body,
    createdAt: m.createdAt,
    editOf: m.editOf,
    deleteOf: m.deleteOf,
    decryptFailed: m.decryptFailed,
  };
}

function isSameRenderGroup(
  aSender: string,
  aTime: string,
  bSender: string,
  bTime: string,
): boolean {
  if (aSender !== bSender) return false;
  const diff = Math.abs(new Date(aTime).getTime() - new Date(bTime).getTime());
  return diff <= 60 * 1000;
}

function isOptimisticPending(id: string): boolean {
  return id.startsWith("local:");
}

function messageUuidFromId(id: string): string {
  return id.startsWith("local:") ? id.slice("local:".length) : id;
}

function optimisticId(messageUuid: string): string {
  return `local:${messageUuid}`;
}

function ChatHistorySkeleton() {
  return (
    <div
      className="flex flex-1 flex-col justify-end gap-[var(--sp-3)] px-[var(--sp-3)] pb-[var(--sp-4)]"
      aria-hidden
    >
      <div className="flex justify-start">
        <div className="skeleton-shimmer h-12 w-[62%] max-w-[240px] rounded-[18px] rounded-bl-[6px]" />
      </div>
      <div className="flex justify-end">
        <div className="skeleton-shimmer h-10 w-[48%] max-w-[200px] rounded-[18px] rounded-br-[6px]" />
      </div>
    </div>
  );
}

export function GroupRoom() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();
  const { requireKeyImport } = useKeyGate();
  const { getNickname } = useNicknames();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<GroupMemberWithKey[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myJoinedAt, setMyJoinedAt] = useState<string | null>(null);
  const [groupCreatedAt, setGroupCreatedAt] = useState<string | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [membersRevision, setMembersRevision] = useState(0);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const messagesRef = useRef<DisplayMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const photoViewerHostRef = useRef<HTMLDivElement>(null);
  const seenRowIdsRef = useRef(new Set<string>());
  const seenMessageUuidsRef = useRef(new Set<string>());
  const myUserIdRef = useRef<string | null>(null);
  const myPrivateKeyRef = useRef<string | null>(null);
  const membersRef = useRef<GroupMemberWithKey[]>([]);
  const senderPublicKeyByUserIdRef = useRef(new Map<string, string>());
  const pendingByUuidRef = useRef<
    Map<
      string,
      {
        tempId: string;
        body: string;
        isEdit?: boolean;
        isDelete?: boolean;
        targetId?: string;
      }
    >
  >(new Map());
  const initialMessageIdsRef = useRef<Set<string> | null>(null);
  const [loadedGroupId, setLoadedGroupId] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasMoreHistoryRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const historyCursorRef = useRef<HistoryCursor | null>(null);
  const clearedAtRef = useRef<string | null>(null);
  const pendingMutationsRef = useRef<PendingMutations<DisplayMessage>>(
    emptyPending(),
  );
  const hiddenIdsRef = useRef<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInitialText, setEditInitialText] = useState<string | null>(null);
  const [deleteForEveryoneTarget, setDeleteForEveryoneTarget] =
    useState<DisplayMessage | null>(null);
  const [deletingForEveryone, setDeletingForEveryone] = useState(false);
  const pendingScrollAnchorRef = useRef<ScrollAnchor | null>(null);
  const groupIdRef = useRef(groupId);
  const pendingFileRef = useRef<Map<string, File>>(new Map());
  const pendingAudioRef = useRef<
    Map<string, { bytes: Uint8Array; mime: string; durationMs: number }>
  >(new Map());

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  useEffect(() => {
    hasMoreHistoryRef.current = hasMoreHistory;
  }, [hasMoreHistory]);

  useLayoutEffect(() => {
    setStatus("loading");
    setMessages([]);
    setError(null);
    setName("");
    setAvatarId(null);
    setMemberCount(0);
    setMembers([]);
    setMyJoinedAt(null);
    setGroupCreatedAt(null);
    setGroupInfoOpen(false);
    setLoadedGroupId(null);
    setHasMoreHistory(true);
    setLoadingOlder(false);
    initialMessageIdsRef.current = null;
    hasMoreHistoryRef.current = true;
    loadingOlderRef.current = false;
    historyCursorRef.current = null;
    pendingScrollAnchorRef.current = null;
    pendingFileRef.current.clear();
    pendingAudioRef.current.clear();
    pendingMutationsRef.current = emptyPending();
    hiddenIdsRef.current.clear();
    setEditingMessageId(null);
    setEditInitialText(null);
    setDeleteForEveryoneTarget(null);
  }, [groupId]);

  const {
    scrollerRef,
    contentRef,
    paneStyle,
    isAnchoring,
    isAnchoringRef,
    scrollToBottom,
    isNearBottom,
  } = useConversationAnchoring(
    groupId,
    status === "ready" && loadedGroupId === groupId,
  );

  useMarkConversationRead(
    "group",
    groupId,
    status === "ready" && loadedGroupId === groupId,
  );

  useLayoutEffect(() => {
    const anchor = pendingScrollAnchorRef.current;
    if (!anchor) return;
    pendingScrollAnchorRef.current = null;
    restoreScrollAnchor(scrollerRef.current, anchor);
  }, [messages, scrollerRef]);

  useEffect(() => {
    return () => {
      stopVoicePlayback();
      for (const m of messagesRef.current) {
        if (m.localPreviewUrl) {
          URL.revokeObjectURL(m.localPreviewUrl);
        }
      }
    };
  }, [groupId]);

  useEffect(() => {
    if (status === "ready" && initialMessageIdsRef.current === null) {
      initialMessageIdsRef.current = new Set(messages.map((m) => m.id));
    }
  }, [status, messages]);

  useEffect(() => {
    if (isAnchoringRef.current) return;
    if (!isNearBottom()) return;
    scrollToBottom();
  }, [messages, isNearBottom, scrollToBottom, isAnchoringRef]);

  const scrollOnViewport = useCallback(() => {
    if (isAnchoringRef.current) return;
    scrollToBottom();
  }, [scrollToBottom, isAnchoringRef]);

  const appendDecryptedMessage = useCallback((display: DisplayMessage) => {
    if (seenMessageUuidsRef.current.has(display.id)) {
      const pending = pendingByUuidRef.current.get(display.id);
      if (pending) {
        pendingByUuidRef.current.delete(display.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pending.tempId
              ? {
                  ...m,
                  id: display.id,
                  createdAt: display.createdAt,
                  body: display.body,
                  decryptFailed: display.decryptFailed,
                  failed: false,
                }
              : m,
          ),
        );
      }
      return;
    }

    seenMessageUuidsRef.current.add(display.id);
    setMessages((prev) => {
      if (prev.some((m) => m.id === display.id || messageUuidFromId(m.id) === display.id)) {
        return prev;
      }
      return [...prev, display];
    });
  }, []);

  const refreshMemberCache = useCallback(async () => {
    const userId = myUserIdRef.current;
    if (!userId) return;

    const membersResult = await fetchGroupMembersWithKeys(groupId, userId);
    if (!membersResult.ok) return;

    const senderKeyMap = new Map<string, string>();
    for (const member of membersResult.members) {
      senderKeyMap.set(member.userId, member.publicKey);
    }

    membersRef.current = membersResult.members;
    senderPublicKeyByUserIdRef.current = senderKeyMap;
    setMembers(membersResult.members);
    setMemberCount(membersResult.members.length);
    setMembersRevision((v) => v + 1);
  }, [groupId]);

  useVisualViewport(scrollOnViewport);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current) return;
    if (!hasMoreHistoryRef.current) return;
    if (isAnchoringRef.current) return;

    const cursor = historyCursorRef.current;
    if (!cursor) {
      hasMoreHistoryRef.current = false;
      setHasMoreHistory(false);
      return;
    }

    const userId = myUserIdRef.current;
    const privateKey = myPrivateKeyRef.current;
    if (!userId || !privateKey) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const supabase = createClient();
      const startedFor = groupIdRef.current;
      let query = supabase
        .from("group_messages")
        .select(GROUP_MESSAGE_SELECT)
        .eq("group_id", startedFor)
        .eq("recipient_id", userId)
        .or(olderThanOrFilter(cursor));
      query = applyAfterClear(query, clearedAtRef.current);
      const { data: rows, error: messagesError } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(GROUP_FETCH_LIMIT);

      if (messagesError) return;

      const newestFirst = (rows ?? []) as GroupMessageRow[];
      if (newestFirst.length < GROUP_FETCH_LIMIT) {
        hasMoreHistoryRef.current = false;
        setHasMoreHistory(false);
      }
      if (newestFirst.length === 0) return;

      const uniqueNewestFirst = takeUniqueGroupRowsByUuid(
        newestFirst,
        PAGE_SIZE,
      );
      const chronological = chronologicalAsc(uniqueNewestFirst);
      const decrypted = await decryptGroupMessageBatch(
        chronological,
        senderPublicKeyByUserIdRef.current,
        privateKey,
      );

      if (groupIdRef.current !== startedFor) return;

      for (const row of newestFirst) {
        seenRowIdsRef.current.add(row.id);
      }

      const fresh = decrypted
        .filter((m) => !seenMessageUuidsRef.current.has(m.id))
        .map((m) => toDisplayMessage(m));

      for (const m of fresh) {
        seenMessageUuidsRef.current.add(m.id);
        initialMessageIdsRef.current?.add(m.id);
      }

      historyCursorRef.current = cursorFromOldestRow(chronological[0]);

      if (fresh.length === 0) return;

      pendingScrollAnchorRef.current = captureScrollAnchor(scrollerRef.current);
      const integrated = integrateMessageBatch(
        messagesRef.current,
        fresh,
        pendingMutationsRef.current,
        clearedAtRef.current,
        hiddenIdsRef.current,
        true,
      );
      pendingMutationsRef.current = {
        pendingEdits: integrated.pendingEdits,
        pendingDeletes: integrated.pendingDeletes,
      };
      setMessages(integrated.messages);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [isAnchoringRef, scrollerRef]);

  useEffect(() => {
    if (status !== "ready" || loadedGroupId !== groupId) return;
    if (!hasMoreHistory || isAnchoring) return;

    const root = scrollerRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        void loadOlderMessages();
      },
      { root, rootMargin: "800px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    status,
    loadedGroupId,
    groupId,
    hasMoreHistory,
    isAnchoring,
    loadOlderMessages,
    scrollerRef,
    messages.length,
  ]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      setStatus("loading");
      setError(null);
      seenRowIdsRef.current = new Set();
      seenMessageUuidsRef.current = new Set();
      pendingByUuidRef.current.clear();
      historyCursorRef.current = null;
      hasMoreHistoryRef.current = true;
      setHasMoreHistory(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setError("Not signed in.");
            setStatus("error");
          }
          return;
        }

        if (!(await hasPrivateKey(user.id))) {
          if (!cancelled) requireKeyImport();
          return;
        }

        const privateKey = await loadPrivateKey(user.id);
        if (!privateKey) {
          if (!cancelled) requireKeyImport();
          return;
        }

        const shell = await fetchGroupShell(groupId, user.id);
        if (!shell.ok) {
          if (!cancelled) {
            setError(shell.error);
            setStatus("error");
          }
          return;
        }

        const { data: myMembership } = await supabase
          .from("group_members")
          .select("joined_at")
          .eq("group_id", groupId)
          .eq("user_id", user.id)
          .maybeSingle();

        const { data: groupRow } = await supabase
          .from("groups")
          .select("created_at")
          .eq("id", groupId)
          .maybeSingle();

        const membersResult = await fetchGroupMembersWithKeys(groupId, user.id);
        if (!membersResult.ok) {
          if (!cancelled) {
            setError(membersResult.error);
            setStatus("error");
          }
          return;
        }

        const senderKeyMap = new Map<string, string>();
        for (const member of membersResult.members) {
          senderKeyMap.set(member.userId, member.publicKey);
        }

        const clearedAt = await fetchClearedAt("group", groupId);
        clearedAtRef.current = clearedAt;
        const hiddenIds = await fetchMessageHides(groupId);
        hiddenIdsRef.current = hiddenIds;

        let messagesQuery = supabase
          .from("group_messages")
          .select(GROUP_MESSAGE_SELECT)
          .eq("group_id", groupId)
          .eq("recipient_id", user.id);
        messagesQuery = applyAfterClear(messagesQuery, clearedAt);
        const { data: rows, error: messagesError } = await messagesQuery
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(GROUP_FETCH_LIMIT);

        if (messagesError) {
          if (!cancelled) {
            setError("Could not load messages.");
            setStatus("error");
          }
          return;
        }

        const newestFirst = (rows ?? []) as GroupMessageRow[];
        const uniqueNewestFirst = takeUniqueGroupRowsByUuid(
          newestFirst,
          PAGE_SIZE,
        );
        const chronological = chronologicalAsc(uniqueNewestFirst);
        const decrypted = await decryptGroupMessageBatch(
          chronological,
          senderKeyMap,
          privateKey,
        );

        const merged = mergeMessagesWithEdits(
          decrypted.map((m) => toDisplayMessage(m)),
          clearedAt,
          hiddenIds,
        );
        pendingMutationsRef.current = {
          pendingEdits: merged.pendingEdits,
          pendingDeletes: merged.pendingDeletes,
        };

        if (cancelled) return;

        for (const row of newestFirst) {
          seenRowIdsRef.current.add(row.id as string);
        }
        for (const m of decrypted) {
          seenMessageUuidsRef.current.add(m.id);
        }

        historyCursorRef.current = cursorFromOldestRow(chronological[0]);
        const more = newestFirst.length >= GROUP_FETCH_LIMIT;
        hasMoreHistoryRef.current = more;
        setHasMoreHistory(more);

        membersRef.current = membersResult.members;
        senderPublicKeyByUserIdRef.current = senderKeyMap;
        setMembers(membersResult.members);
        myUserIdRef.current = user.id;
        myPrivateKeyRef.current = privateKey;
        setMyUserId(user.id);
        setName(shell.name);
        setAvatarId(shell.avatarId);
        setMemberCount(shell.memberCount);
        setMyJoinedAt((myMembership?.joined_at as string | undefined) ?? null);
        setGroupCreatedAt((groupRow?.created_at as string | undefined) ?? null);
        setMessages(merged.messages);
        setLoadedGroupId(groupId);
        setStatus("ready");

        channel = supabase
          .channel(`group-messages:${groupId}:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "group_messages",
              filter: `group_id=eq.${groupId}`,
            },
            (payload) => {
              void (async () => {
                const row = payload.new as GroupMessageRow;
                if (!row?.id || row.recipient_id !== user.id) return;
                if (seenRowIdsRef.current.has(row.id)) return;
                seenRowIdsRef.current.add(row.id);

                const myId = myUserIdRef.current;
                if (myId && row.sender_id === myId) {
                  const pending = pendingByUuidRef.current.get(row.message_uuid);
                  if (pending) {
                    pendingByUuidRef.current.delete(row.message_uuid);
                    seenMessageUuidsRef.current.add(row.message_uuid);
                    if (cancelled) return;
                    if (pending.isEdit && pending.targetId) {
                      return;
                    }
                    if (pending.isDelete && pending.targetId) {
                      return;
                    }
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === pending.tempId
                          ? {
                              ...m,
                              id: row.message_uuid,
                              createdAt: row.created_at,
                              failed: false,
                            }
                          : m,
                      ),
                    );
                    return;
                  }
                }

                const display = await decryptGroupMessageRow(
                  row,
                  senderPublicKeyByUserIdRef.current.get(row.sender_id),
                  privateKey,
                );

                if (cancelled) return;

                const scope = attachmentCacheScope("group", groupId);

                if (row.delete_of || deleteMetaFromMessage(display.body, row.delete_of)) {
                  setMessages((prev) => {
                    const applied = applyIncomingDelete(
                      prev,
                      toDisplayMessage(display),
                      clearedAtRef.current,
                      { purgeAttachments: true, cacheScope: scope },
                    );
                    return applied ?? prev;
                  });
                  seenMessageUuidsRef.current.add(display.id);
                  return;
                }

                if (row.edit_of || editMetaFromMessage(display.body, row.edit_of)) {
                  setMessages((prev) => {
                    const applied = applyIncomingEdit(
                      prev,
                      toDisplayMessage(display),
                      clearedAtRef.current,
                    );
                    return applied ?? prev;
                  });
                  seenMessageUuidsRef.current.add(display.id);
                  return;
                }

                appendDecryptedMessage(toDisplayMessage(display));
                markReadIfVisible("group", groupId);
              })();
            },
          )
          .subscribe();
      } catch {
        if (!cancelled) {
          setError("Something went wrong loading this chat.");
          setStatus("error");
        }
      }
    }

    void setup();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [groupId, requireKeyImport, appendDecryptedMessage]);

  useEffect(() => {
    if (status !== "ready") return;

    const supabase = createClient();
    const userId = myUserIdRef.current;
    if (!userId) return;

    let cancelled = false;

    const channel = supabase
      .channel(`group-membership:${groupId}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          if (cancelled) return;
          void refreshMemberCache();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          if (cancelled) return;
          void refreshMemberCache();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          if (cancelled) return;
          const old = payload.old as { user_id?: string; group_id?: string };
          if (old.user_id === userId) {
            setGroupNotice("You're no longer in this group.");
            router.push("/chats");
            return;
          }
          void refreshMemberCache();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "groups",
          filter: `id=eq.${groupId}`,
        },
        (payload) => {
          if (cancelled) return;
          const updated = payload.new as {
            name?: string;
            avatar?: string | null;
          };
          if (updated.name) setName(updated.name);
          if ("avatar" in updated) {
            setAvatarId((updated.avatar as string | null) ?? null);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [status, groupId, refreshMemberCache, router]);

  const sendGroupDeleteForEveryone = useCallback(
    (target: DisplayMessage) => {
      const myId = myUserIdRef.current;
      const myKey = myPrivateKeyRef.current;
      const members = membersRef.current;
      if (!myId || !myKey || members.length === 0) return;

      const deleteOf = target.id;
      const messageUuid = crypto.randomUUID();
      const optimisticCreatedAt = new Date().toISOString();
      const plaintext = buildDeleteEnvelopeBody(deleteOf);
      const scope = attachmentCacheScope("group", groupId);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === deleteOf
            ? {
                ...m,
                deleted: true,
                edited: false,
                deleteAppliedAt: optimisticCreatedAt,
                failed: false,
              }
            : m,
        ),
      );

      purgeAttachmentsForBody(target.body, {
        deleteFromStorage: true,
        cacheScope: scope,
      });

      pendingByUuidRef.current.set(messageUuid, {
        tempId: optimisticId(messageUuid),
        body: plaintext,
        isDelete: true,
        targetId: deleteOf,
      });

      void (async () => {
        setSending(true);
        try {
          const encryptedRows = await Promise.all(
            members.map(async (member) => {
              const { ciphertext, nonce } = await encryptMessage(
                plaintext,
                member.publicKey,
                myKey,
              );
              return {
                group_id: groupId,
                message_uuid: messageUuid,
                sender_id: myId,
                recipient_id: member.userId,
                ciphertext,
                nonce,
                delete_of: deleteOf,
              };
            }),
          );

          const supabase = createClient();
          const { data: inserted, error: insertError } = await supabase
            .from("group_messages")
            .insert(encryptedRows)
            .select(GROUP_MESSAGE_SELECT);

          if (insertError || !inserted?.length) {
            throw new Error("Could not delete message");
          }

          for (const row of inserted) {
            seenRowIdsRef.current.add(row.id as string);
          }
          pendingByUuidRef.current.delete(messageUuid);
          seenMessageUuidsRef.current.add(messageUuid);
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === deleteOf
                ? {
                    ...m,
                    deleted: false,
                    deleteAppliedAt: undefined,
                    failed: true,
                  }
                : m,
            ),
          );
        } finally {
          setSending(false);
        }
      })();
    },
    [groupId],
  );

  const deleteForMe = useCallback(
    async (messageId: string) => {
      hiddenIdsRef.current.add(messageId);
      setMessages((prev) => removeMessageById(prev, messageId));
      const result = await markMessageHidden(messageId, groupId);
      if (!result.ok) {
        hiddenIdsRef.current.delete(messageId);
        void fetchMessageHides(groupId).then((ids) => {
          hiddenIdsRef.current = ids;
        });
      }
    },
    [groupId],
  );

  const confirmDeleteForEveryone = useCallback(() => {
    if (!deleteForEveryoneTarget) return;
    setDeletingForEveryone(true);
    sendGroupDeleteForEveryone(deleteForEveryoneTarget);
    setDeleteForEveryoneTarget(null);
    setDeletingForEveryone(false);
  }, [deleteForEveryoneTarget, sendGroupDeleteForEveryone]);

  const sendGroupMessage = useCallback(
    (
      text: string,
      existingMessageUuid?: string,
      options?: { manageSendingState?: boolean; editOf?: string },
    ) => {
      const manageSendingState = options?.manageSendingState !== false;
      const editOf = options?.editOf;
      const myId = myUserIdRef.current;
      const myKey = myPrivateKeyRef.current;
      const members = membersRef.current;
      if (!myId || !myKey || members.length === 0) return;

      const messageUuid = existingMessageUuid ?? crypto.randomUUID();
      const tempId = optimisticId(messageUuid);
      const optimisticCreatedAt = new Date().toISOString();
      const plaintext = editOf ? buildEditBody(text, editOf) : text;

      if (editOf) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editOf
              ? {
                  ...m,
                  body: text,
                  edited: true,
                  editAppliedAt: optimisticCreatedAt,
                  failed: false,
                  decryptFailed: false,
                }
              : m,
          ),
        );
      } else {
        setMessages((prev) => {
          const existing = prev.find(
            (m) => m.id === tempId || messageUuidFromId(m.id) === messageUuid,
          );
          if (existing) {
            return prev.map((m) =>
              m.id === existing.id
                ? {
                    ...m,
                    body: text,
                    createdAt: optimisticCreatedAt,
                    failed: false,
                    decryptFailed: false,
                  }
                : m,
            );
          }
          if (prev.some((m) => m.id === tempId)) return prev;
          return [
            ...prev,
            {
              id: tempId,
              senderId: myId,
              body: text,
              createdAt: optimisticCreatedAt,
            },
          ];
        });
      }

      pendingByUuidRef.current.set(messageUuid, {
        tempId: editOf ? optimisticId(messageUuid) : tempId,
        body: text,
        isEdit: Boolean(editOf),
        targetId: editOf,
      });

      void (async () => {
        if (manageSendingState) {
          setSending(true);
        }

        try {
          if (!(await hasPrivateKey(myId))) {
            requireKeyImport();
            return;
          }

          const missingKey = members.find((m) => !m.publicKey?.trim());
          if (missingKey) {
            throw new Error("Member key missing");
          }

          const encryptedRows = await Promise.all(
            members.map(async (member) => {
              const { ciphertext, nonce } = await encryptMessage(
                plaintext,
                member.publicKey,
                myKey,
              );
              return {
                group_id: groupId,
                message_uuid: messageUuid,
                sender_id: myId,
                recipient_id: member.userId,
                ciphertext,
                nonce,
                edit_of: editOf ?? null,
              };
            }),
          );

          const supabase = createClient();
          const { data: inserted, error: insertError } = await supabase
            .from("group_messages")
            .insert(encryptedRows)
            .select(GROUP_MESSAGE_SELECT);

          if (insertError || !inserted?.length) {
            throw new Error("Could not send message");
          }

          for (const row of inserted) {
            seenRowIdsRef.current.add(row.id as string);
          }

          pendingByUuidRef.current.delete(messageUuid);
          seenMessageUuidsRef.current.add(messageUuid);

          if (!editOf) {
            const selfRow = (inserted as GroupMessageRow[]).find(
              (row) => row.recipient_id === myId,
            );

            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId || messageUuidFromId(m.id) === messageUuid
                  ? {
                      ...m,
                      id: messageUuid,
                      createdAt: selfRow?.created_at ?? optimisticCreatedAt,
                      failed: false,
                    }
                  : m,
              ),
            );
          }
          pendingFileRef.current.delete(tempId);
          pendingFileRef.current.delete(messageUuid);
          pendingAudioRef.current.delete(tempId);
          pendingAudioRef.current.delete(messageUuid);
        } catch {
          if (!(await hasPrivateKey(myId))) {
            requireKeyImport();
            return;
          }

          if (editOf) {
            setMessages((prev) =>
              prev.map((m) => (m.id === editOf ? { ...m, failed: true } : m)),
            );
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId || messageUuidFromId(m.id) === messageUuid
                  ? { ...m, failed: true }
                  : m,
              ),
            );
          }
        } finally {
          if (manageSendingState) {
            setSending(false);
          }
        }
      })();

      return messageUuid;
    },
    [groupId, requireKeyImport],
  );

  const runVideoSend = useCallback(
    async (file: File, existingMessageUuid?: string) => {
      const myId = myUserIdRef.current;
      if (!myId) return;

      setAttachError(null);
      setAttachUploading(true);

      const messageUuid = existingMessageUuid ?? crypto.randomUUID();
      const tempId = optimisticId(messageUuid);

      pendingFileRef.current.set(messageUuid, file);

      if (file.size > 50 * 1024 * 1024) {
        setAttachError("Videos must be under 50MB.");
        setAttachUploading(false);
        return;
      }

      if (!existingMessageUuid) {
        setMessages((prev) => {
          if (prev.some((m) => messageUuidFromId(m.id) === messageUuid)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: tempId,
              senderId: myId,
              body: "",
              createdAt: new Date().toISOString(),
              pendingAttachment: { kind: "video", w: 200, h: 200 },
            },
          ];
        });
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            messageUuidFromId(m.id) === messageUuid
              ? {
                  ...m,
                  failed: false,
                  pendingAttachment: m.pendingAttachment ?? {
                    kind: "video",
                    w: 200,
                    h: 200,
                  },
                }
              : m,
          ),
        );
      }

      let previewUrl: string | undefined;

      try {
        const processed = await processVideoForSend(file);

        if (processed.thumbBytes) {
          previewUrl = URL.createObjectURL(
            new Blob([processed.thumbBytes.slice()], { type: "image/jpeg" }),
          );
        }

        setMessages((prev) =>
          prev.map((m) =>
            messageUuidFromId(m.id) === messageUuid
              ? {
                  ...m,
                  localPreviewUrl: m.localPreviewUrl ?? previewUrl,
                  pendingAttachment: {
                    kind: "video",
                    w: processed.w,
                    h: processed.h,
                    durationMs: processed.durationMs,
                  },
                }
              : m,
          ),
        );

        const { ciphertext, fileKey, nonce } = await encryptFile(processed.bytes);

        let thumbMeta: { path: string; key: string; nonce: string } | undefined;
        if (processed.thumbBytes) {
          const thumbEnc = await encryptFile(processed.thumbBytes);
          const thumbPath = await uploadEncryptedAttachment(
            thumbEnc.ciphertext,
            myId,
          );
          thumbMeta = {
            path: thumbPath,
            key: thumbEnc.fileKey,
            nonce: thumbEnc.nonce,
          };
        }

        const path = await uploadEncryptedAttachment(ciphertext, myId);
        const body = buildAttachmentBody({
          v: 1,
          kind: "video",
          path,
          key: fileKey,
          nonce,
          mime: processed.mime,
          size: processed.bytes.length,
          w: processed.w,
          h: processed.h,
          durationMs: processed.durationMs,
          thumb: thumbMeta,
        });

        sendGroupMessage(body, messageUuid, { manageSendingState: false });
      } catch (err) {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        if (
          err instanceof VideoTooLargeError ||
          err instanceof VideoUnsupportedError
        ) {
          setAttachError(err.message);
          setMessages((prev) =>
            prev.filter((m) => messageUuidFromId(m.id) !== messageUuid),
          );
          pendingFileRef.current.delete(messageUuid);
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            messageUuidFromId(m.id) === messageUuid ? { ...m, failed: true } : m,
          ),
        );
      } finally {
        setAttachUploading(false);
      }
    },
    [sendGroupMessage],
  );

  const runAudioSend = useCallback(
    async (
      payload: VoiceRecordingPayload,
      existingMessageUuid?: string,
    ) => {
      const myId = myUserIdRef.current;
      if (!myId) return;

      setAttachError(null);
      setAttachUploading(true);

      const messageUuid = existingMessageUuid ?? crypto.randomUUID();
      const tempId = optimisticId(messageUuid);

      pendingAudioRef.current.set(messageUuid, payload);

      if (!existingMessageUuid) {
        setMessages((prev) => {
          if (prev.some((m) => messageUuidFromId(m.id) === messageUuid)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: tempId,
              senderId: myId,
              body: "",
              createdAt: new Date().toISOString(),
              pendingAttachment: {
                kind: "audio",
                durationMs: payload.durationMs,
              },
            },
          ];
        });
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            messageUuidFromId(m.id) === messageUuid
              ? {
                  ...m,
                  failed: false,
                  pendingAttachment: {
                    kind: "audio",
                    durationMs: payload.durationMs,
                  },
                }
              : m,
          ),
        );
      }

      try {
        const { ciphertext, fileKey, nonce } = await encryptFile(payload.bytes);
        const path = await uploadEncryptedAttachment(ciphertext, myId);
        const body = buildAttachmentBody({
          v: 1,
          kind: "audio",
          path,
          key: fileKey,
          nonce,
          mime: payload.mime,
          size: payload.bytes.length,
          durationMs: payload.durationMs,
        });

        sendGroupMessage(body, messageUuid, { manageSendingState: false });
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            messageUuidFromId(m.id) === messageUuid ? { ...m, failed: true } : m,
          ),
        );
      } finally {
        setAttachUploading(false);
      }
    },
    [sendGroupMessage],
  );

  const runAttachmentSend = useCallback(
    async (file: File, existingMessageUuid?: string) => {
      const myId = myUserIdRef.current;
      if (!myId) return;

      setAttachError(null);
      setAttachUploading(true);

      const messageUuid = existingMessageUuid ?? crypto.randomUUID();
      const tempId = optimisticId(messageUuid);
      const previewUrl = URL.createObjectURL(file);
      pendingFileRef.current.set(messageUuid, file);

      if (!existingMessageUuid) {
        setMessages((prev) => {
          if (prev.some((m) => messageUuidFromId(m.id) === messageUuid)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: tempId,
              senderId: myId,
              body: "",
              createdAt: new Date().toISOString(),
              localPreviewUrl: previewUrl,
            },
          ];
        });
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            messageUuidFromId(m.id) === messageUuid
              ? {
                  ...m,
                  failed: false,
                  localPreviewUrl: m.localPreviewUrl ?? previewUrl,
                }
              : m,
          ),
        );
      }

      try {
        const processed = await processImageForSend(file);
        const { ciphertext, fileKey, nonce } = await encryptFile(processed.bytes);
        const path = await uploadEncryptedAttachment(ciphertext, myId);
        const body = buildAttachmentBody({
          v: 1,
          kind: "image",
          path,
          key: fileKey,
          nonce,
          mime: "image/jpeg",
          size: processed.bytes.length,
          w: processed.w,
          h: processed.h,
        });

        sendGroupMessage(body, messageUuid, { manageSendingState: false });
      } catch (err) {
        if (err instanceof ImageTooLargeError) {
          setAttachError(err.message);
          URL.revokeObjectURL(previewUrl);
          setMessages((prev) =>
            prev.filter((m) => messageUuidFromId(m.id) !== messageUuid),
          );
          pendingFileRef.current.delete(messageUuid);
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            messageUuidFromId(m.id) === messageUuid ? { ...m, failed: true } : m,
          ),
        );
      } finally {
        setAttachUploading(false);
      }
    },
    [sendGroupMessage],
  );

  const handleFileSelected = useCallback(
    (file: File) => {
      if (file.type.startsWith("image/")) {
        void runAttachmentSend(file);
      } else if (file.type.startsWith("video/")) {
        void runVideoSend(file);
      } else {
        setAttachError("Unsupported file type.");
      }
    },
    [runAttachmentSend, runVideoSend],
  );

  const handleVoiceSend = useCallback(
    (payload: VoiceRecordingPayload) => {
      void runAudioSend(payload);
    },
    [runAudioSend],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (editingMessageId) {
        sendGroupMessage(text, crypto.randomUUID(), { editOf: editingMessageId });
        setEditingMessageId(null);
        setEditInitialText(null);
        return;
      }
      sendGroupMessage(text);
    },
    [sendGroupMessage, editingMessageId],
  );

  const startEditMessage = useCallback((message: DisplayMessage) => {
    const parsed = parseMessageBody(message.body);
    if (parsed.type !== "text") return;
    setEditingMessageId(message.id);
    setEditInitialText(parsed.text);
  }, []);

  const cancelEditMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditInitialText(null);
  }, []);

  const handleRetry = useCallback(
    (id: string) => {
      const messageUuid = messageUuidFromId(id);
      const audio = pendingAudioRef.current.get(messageUuid);
      if (audio) {
        void runAudioSend(audio, messageUuid);
        return;
      }
      const file = pendingFileRef.current.get(messageUuid);
      if (file) {
        if (file.type.startsWith("video/")) {
          void runVideoSend(file, messageUuid);
        } else {
          void runAttachmentSend(file, messageUuid);
        }
        return;
      }
      const msg = messagesRef.current.find(
        (m) => m.id === id || messageUuidFromId(m.id) === messageUuid,
      );
      if (!msg) return;
      sendGroupMessage(msg.body, messageUuid);
    },
    [sendGroupMessage, runAttachmentSend, runVideoSend, runAudioSend],
  );

  if (status === "loading") {
    return (
      <div className="screen-enter flex h-app min-h-0 w-full min-w-0 flex-col overflow-x-hidden bg-[var(--bg)] md:h-full md:flex-1">
        <header className="safe-pt shrink-0 border-b border-[var(--divider)] bg-[var(--bg)]">
          <div className="flex h-[52px] items-center px-[var(--sp-3)]">
            <Link
              href="/chats"
              aria-label="Back to chats"
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] md:hidden"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Link>
          </div>
        </header>
        <ChatHistorySkeleton />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-6">
        <p className="text-[13px] text-red-400" role="alert">
          {error}
        </p>
        <Link
          href="/chats"
          className="pressable text-[length:var(--text-secondary-size)] font-medium text-[var(--accent)]"
        >
          Back to chats
        </Link>
      </div>
    );
  }

  const memberLabel =
    memberCount === 1 ? "1 member" : `${memberCount} members`;

  const showJoinPill =
    !hasMoreHistory &&
    Boolean(myJoinedAt && groupCreatedAt && messages.length > 0) &&
    new Date(myJoinedAt!).getTime() >
      new Date(groupCreatedAt!).getTime() + 1000;

  return (
    <PhotoViewerHostProvider hostRef={photoViewerHostRef}>
      <div className="screen-enter relative flex h-app min-h-0 w-full min-w-0 flex-col overflow-x-hidden bg-[var(--bg)] md:h-full md:flex-1">
        <header className="safe-pt shrink-0 border-b border-[var(--row-separator)] bg-[var(--bg)]">
          <div className="flex h-[52px] items-center gap-[var(--sp-2)] px-[var(--sp-3)]">
            <Link
              href="/chats"
              aria-label="Back to chats"
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] md:hidden"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Link>
            <button
              type="button"
              onClick={() => setGroupInfoOpen(true)}
              className="row-press flex min-h-11 min-w-0 flex-1 items-center gap-[var(--sp-3)] rounded-[var(--radius-input)] text-left"
            >
              <GroupAvatar avatarId={avatarId} size={36} />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                <p className="truncate text-[16px] font-semibold leading-tight text-[var(--text-primary)]">
                  {name}
                </p>
                <p className="truncate text-[12px] leading-tight text-[var(--text-secondary)]">
                  {memberLabel}
                </p>
              </div>
            </button>
          </div>
        </header>

        <div
          ref={scrollerRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "none" }}
        >
          <div
            ref={contentRef}
            style={paneStyle}
            className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-[var(--sp-3)] pb-[var(--sp-2)] pt-[var(--sp-2)]"
          >
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-[var(--sp-2)] text-center">
                <GroupAvatar avatarId={avatarId} size={48} />
                <p className="text-[length:var(--text-secondary-size)] font-semibold text-[var(--text-primary)]">
                  {name}
                </p>
                <p className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                  {memberLabel}
                </p>
                <p className="max-w-[240px] text-[length:var(--text-secondary-size)] leading-[1.4] text-[var(--text-secondary)]">
                  No messages yet.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {hasMoreHistory ? (
                  <li className="h-px w-full shrink-0 list-none" aria-hidden>
                    <div ref={topSentinelRef} className="h-px w-full" />
                  </li>
                ) : null}
                {loadingOlder ? (
                  <li className="flex list-none justify-center py-3" aria-hidden>
                    <InlineSpinner className="h-4 w-4 text-[var(--text-secondary)]" />
                  </li>
                ) : null}
                {showJoinPill ? (
                  <li>
                    <SystemPill>
                      Messages before you joined aren&apos;t visible.
                    </SystemPill>
                  </li>
                ) : null}
                {messages.map((m, i) => {
                  const mine = m.senderId === myUserId;
                  const prev = messages[i - 1];
                  const next = messages[i + 1];

                  const sameGroupPrev = prev
                    ? isSameRenderGroup(
                        prev.senderId,
                        prev.createdAt,
                        m.senderId,
                        m.createdAt,
                      )
                    : false;
                  const sameGroupNext = next
                    ? isSameRenderGroup(
                        m.senderId,
                        m.createdAt,
                        next.senderId,
                        next.createdAt,
                      )
                    : false;

                  const isFirstInGroup = !sameGroupPrev;
                  const isLastInGroup = !sameGroupNext;
                  const showDayDivider =
                    !prev || !isSameCalendarDay(prev.createdAt, m.createdAt);

                  const senderMember = members.find(
                    (member) => member.userId === m.senderId,
                  );
                  const senderFullName =
                    !mine && isFirstInGroup && senderMember
                      ? displayName({
                          username: senderMember.username,
                          nickname: getNickname(m.senderId),
                        })
                      : undefined;
                  const senderLabel = senderFullName
                    ? senderFullName.startsWith("@")
                      ? senderFullName.slice(1)
                      : senderFullName.split(/\s+/)[0] || senderFullName
                    : undefined;

                  return (
                    <li key={m.id}>
                      <MessageBubble
                        id={m.id}
                        body={m.body}
                        isMine={mine}
                        timestamp={m.createdAt}
                        showDayDivider={showDayDivider}
                        isFirstInGroup={isFirstInGroup}
                        isLastInGroup={isLastInGroup}
                        isPending={isOptimisticPending(m.id)}
                        animateIn={
                          initialMessageIdsRef.current !== null &&
                          !initialMessageIdsRef.current.has(m.id) &&
                          !m.edited
                        }
                        failed={m.failed}
                        edited={m.edited}
                        deleted={m.deleted}
                        decryptFailed={m.decryptFailed}
                        localPreviewUrl={m.localPreviewUrl}
                        pendingAttachment={m.pendingAttachment}
                        senderLabel={senderLabel}
                        senderId={m.senderId}
                        onRetry={handleRetry}
                        attachmentCacheScope={attachmentCacheScope("group", groupId)}
                        onEditRequest={
                          mine &&
                          canEditMessage(mine, m.body, m.createdAt, m.deleted) &&
                          !editingMessageId
                            ? () => startEditMessage(m)
                            : undefined
                        }
                        onDeleteForEveryoneRequest={
                          mine &&
                          canDeleteForEveryone(mine, m.createdAt, m.deleted) &&
                          !editingMessageId
                            ? () => setDeleteForEveryoneTarget(m)
                            : undefined
                        }
                        onDeleteForMeRequest={
                          !m.deleted && !editingMessageId
                            ? () => void deleteForMe(m.id)
                            : undefined
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <ChatComposer
          onSend={handleSend}
          onFileSelected={handleFileSelected}
          onVoiceSend={handleVoiceSend}
          disabled={sending}
          attachDisabled={attachUploading}
          attachError={attachError}
          editInitialText={editInitialText}
          onCancelEdit={cancelEditMessage}
        />

      {deleteForEveryoneTarget ? (
        <DeleteForEveryoneDialog
          confirming={deletingForEveryone}
          onConfirm={() => void confirmDeleteForEveryone()}
          onCancel={() => {
            if (!deletingForEveryone) setDeleteForEveryoneTarget(null);
          }}
        />
      ) : null}

      {groupInfoOpen && myUserId ? (
        <GroupInfo
          groupId={groupId}
          myUserId={myUserId}
          onClose={() => setGroupInfoOpen(false)}
          onMembershipChanged={() => void refreshMemberCache()}
          onGroupUpdated={(patch) => {
            if (patch.name !== undefined) setName(patch.name);
            if (patch.avatarId !== undefined) setAvatarId(patch.avatarId);
          }}
          onLeftGroup={() => {
            setGroupInfoOpen(false);
          }}
          membersRevision={membersRevision}
        />
      ) : null}
    </div>
    </PhotoViewerHostProvider>
  );
}
