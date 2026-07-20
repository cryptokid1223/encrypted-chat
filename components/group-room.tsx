"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatComposer, type VoiceRecordingPayload } from "@/components/chat-composer";
import { GroupAvatar } from "@/components/group-avatar";
import { GroupInfo } from "@/components/group-info";
import { ChevronLeftIcon } from "@/components/icons";
import { useKeyGate } from "@/components/key-gate";
import { MessageBubble } from "@/components/message-bubble";
import { PhotoViewerHostProvider } from "@/components/photo-viewer-host";
import { useNicknames } from "@/components/nicknames-context";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useConversationAnchoring } from "@/hooks/useConversationAnchoring";
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
import { buildAttachmentBody } from "@/lib/messageContent";
import { createClient } from "@/lib/supabase/client";
import { stopVoicePlayback } from "@/lib/voicePlayer";

type DisplayMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  failed?: boolean;
  decryptFailed?: boolean;
  localPreviewUrl?: string;
  pendingAttachment?: Pick<
    import("@/lib/fileCrypto").AttachmentMeta,
    "kind" | "w" | "h" | "durationMs"
  >;
};

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
  const photoViewerHostRef = useRef<HTMLDivElement>(null);
  const seenRowIdsRef = useRef(new Set<string>());
  const seenMessageUuidsRef = useRef(new Set<string>());
  const myUserIdRef = useRef<string | null>(null);
  const myPrivateKeyRef = useRef<string | null>(null);
  const membersRef = useRef<GroupMemberWithKey[]>([]);
  const senderPublicKeyByUserIdRef = useRef(new Map<string, string>());
  const pendingByUuidRef = useRef<Map<string, { tempId: string; body: string }>>(
    new Map(),
  );
  const initialMessageIdsRef = useRef<Set<string> | null>(null);
  const [loadedGroupId, setLoadedGroupId] = useState<string | null>(null);
  const pendingFileRef = useRef<Map<string, File>>(new Map());
  const pendingAudioRef = useRef<
    Map<string, { bytes: Uint8Array; mime: string; durationMs: number }>
  >(new Map());

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
    initialMessageIdsRef.current = null;
    pendingFileRef.current.clear();
    pendingAudioRef.current.clear();
  }, [groupId]);

  const {
    scrollerRef,
    contentRef,
    paneStyle,
    isAnchoringRef,
    scrollToBottom,
    isNearBottom,
  } = useConversationAnchoring(
    groupId,
    status === "ready" && loadedGroupId === groupId,
  );

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

      try {
        if (!(await hasPrivateKey())) {
          if (!cancelled) requireKeyImport();
          return;
        }

        const privateKey = await loadPrivateKey();
        if (!privateKey) {
          if (!cancelled) requireKeyImport();
          return;
        }

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

        const { data: rows, error: messagesError } = await supabase
          .from("group_messages")
          .select(
            "id, group_id, message_uuid, sender_id, recipient_id, ciphertext, nonce, created_at",
          )
          .eq("group_id", groupId)
          .eq("recipient_id", user.id)
          .order("created_at", { ascending: true });

        if (messagesError) {
          if (!cancelled) {
            setError("Could not load messages.");
            setStatus("error");
          }
          return;
        }

        const decrypted = await decryptGroupMessageBatch(
          (rows ?? []) as GroupMessageRow[],
          senderKeyMap,
          privateKey,
        );

        if (cancelled) return;

        for (const row of rows ?? []) {
          seenRowIdsRef.current.add(row.id as string);
        }
        for (const m of decrypted) {
          seenMessageUuidsRef.current.add(m.id);
        }

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
        setMessages(
          decrypted.map((m) => ({
            id: m.id,
            senderId: m.senderId,
            body: m.body,
            createdAt: m.createdAt,
            decryptFailed: m.decryptFailed,
          })),
        );
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
                appendDecryptedMessage({
                  id: display.id,
                  senderId: display.senderId,
                  body: display.body,
                  createdAt: display.createdAt,
                  decryptFailed: display.decryptFailed,
                });
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

  const sendGroupMessage = useCallback(
    (
      text: string,
      existingMessageUuid?: string,
      options?: { manageSendingState?: boolean },
    ) => {
      const manageSendingState = options?.manageSendingState !== false;
      const myId = myUserIdRef.current;
      const myKey = myPrivateKeyRef.current;
      const members = membersRef.current;
      if (!myId || !myKey || members.length === 0) return;

      const messageUuid = existingMessageUuid ?? crypto.randomUUID();
      const tempId = optimisticId(messageUuid);
      const optimisticCreatedAt = new Date().toISOString();

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

      pendingByUuidRef.current.set(messageUuid, { tempId, body: text });

      void (async () => {
        if (manageSendingState) {
          setSending(true);
        }

        try {
          if (!(await hasPrivateKey())) {
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
                text,
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
              };
            }),
          );

          const supabase = createClient();
          const { data: inserted, error: insertError } = await supabase
            .from("group_messages")
            .insert(encryptedRows)
            .select(
              "id, group_id, message_uuid, sender_id, recipient_id, ciphertext, nonce, created_at",
            );

          if (insertError || !inserted?.length) {
            throw new Error("Could not send message");
          }

          for (const row of inserted) {
            seenRowIdsRef.current.add(row.id as string);
          }

          pendingByUuidRef.current.delete(messageUuid);
          seenMessageUuidsRef.current.add(messageUuid);

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
          pendingFileRef.current.delete(tempId);
          pendingFileRef.current.delete(messageUuid);
          pendingAudioRef.current.delete(tempId);
          pendingAudioRef.current.delete(messageUuid);
        } catch {
          if (!(await hasPrivateKey())) {
            requireKeyImport();
            return;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId || messageUuidFromId(m.id) === messageUuid
                ? { ...m, failed: true }
                : m,
            ),
          );
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
      sendGroupMessage(text);
    },
    [sendGroupMessage],
  );

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
    Boolean(myJoinedAt && groupCreatedAt && messages.length > 0) &&
    new Date(myJoinedAt!).getTime() >
      new Date(groupCreatedAt!).getTime() + 1000;

  return (
    <PhotoViewerHostProvider hostRef={photoViewerHostRef}>
      <div className="screen-enter relative flex h-app min-h-0 w-full min-w-0 flex-col overflow-x-hidden bg-[var(--bg)] md:h-full md:flex-1">
        <header className="safe-pt shrink-0 border-b border-[var(--divider)] bg-[var(--bg)]">
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
              className="row-press flex min-h-11 min-w-0 flex-1 items-center gap-[var(--sp-2)] rounded-[var(--radius-input)] text-left"
            >
              <GroupAvatar avatarId={avatarId} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[length:var(--text-title)] font-semibold leading-tight text-[var(--text-primary)]">
                  {name}
                </p>
                <p className="text-[length:var(--text-caption)] leading-tight text-[var(--text-secondary)]">
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
                {showJoinPill ? (
                  <li>
                    <div
                      className="flex justify-center"
                      style={{ margin: "var(--sp-4) 0" }}
                    >
                      <span className="rounded-[10px] bg-[var(--surface)] px-[10px] py-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                        Messages before you joined aren&apos;t visible.
                      </span>
                    </div>
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
                  const senderLabel =
                    !mine && isFirstInGroup && senderMember
                      ? displayName({
                          username: senderMember.username,
                          nickname: getNickname(m.senderId),
                        })
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
                          !initialMessageIdsRef.current.has(m.id)
                        }
                        failed={m.failed}
                        decryptFailed={m.decryptFailed}
                        localPreviewUrl={m.localPreviewUrl}
                        pendingAttachment={m.pendingAttachment}
                        senderLabel={senderLabel}
                        onRetry={handleRetry}
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
      />

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
