"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon, LockIcon } from "@/components/icons";
import { ContactDetail } from "@/components/contact-detail";
import { useKeyGate } from "@/components/key-gate";
import { useNicknames } from "@/components/nicknames-context";
import { isSameCalendarDay } from "@/lib/chat";
import { encryptMessage } from "@/lib/crypto";
import { encryptFile } from "@/lib/fileCrypto";
import { uploadEncryptedAttachment } from "@/lib/attachmentStorage";
import { ImageTooLargeError, processImageForSend, processVideoForSend, VideoTooLargeError, VideoUnsupportedError } from "@/lib/imageProcessing";
import { buildAttachmentBody } from "@/lib/messageContent";
import { stopVoicePlayback } from "@/lib/voicePlayer";
import { Avatar } from "@/lib/avatars";
import {
  displayName,
  formatAtUsername,
  hasNickname,
} from "@/lib/display-name";
import { hasPrivateKey, loadPrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "@/components/message-bubble";
import { ChatComposer, type VoiceRecordingPayload } from "@/components/chat-composer";
import { PhotoViewerHostProvider } from "@/components/photo-viewer-host";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useConversationAnchoring } from "@/hooks/useConversationAnchoring";
import {
  PAGE_SIZE,
  captureScrollAnchor,
  chronologicalAsc,
  cursorFromOldestRow,
  olderThanOrFilter,
  restoreScrollAnchor,
  type HistoryCursor,
  type ScrollAnchor,
} from "@/hooks/messagePagination";
import type {
  EncryptedMessageRow,
} from "@/lib/message-decrypt";
import {
  decryptMessageBatch,
  decryptMessageRow,
} from "@/lib/message-decrypt";
import { InlineSpinner } from "@/components/inline-spinner";

type DisplayMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  failed?: boolean;
  localPreviewUrl?: string;
  pendingAttachment?: Pick<
    import("@/lib/fileCrypto").AttachmentMeta,
    "kind" | "w" | "h" | "durationMs"
  >;
};

/** Render-layer grouping: same sender within 60 seconds. */
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
      <div className="flex justify-start">
        <div className="skeleton-shimmer h-14 w-[55%] max-w-[220px] rounded-[18px] rounded-bl-[6px]" />
      </div>
    </div>
  );
}

export function ChatRoom() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const { requireKeyImport } = useKeyGate();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [otherUsername, setOtherUsername] = useState("");
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [otherAvatarId, setOtherAvatarId] = useState<string | null>(null);
  const [contactDetailOpen, setContactDetailOpen] = useState(false);
  const { getNickname } = useNicknames();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [theirPublicKey, setTheirPublicKey] = useState<string | null>(null);
  const [myPrivateKey, setMyPrivateKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const messagesRef = useRef<DisplayMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [sending, setSending] = useState(false);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const pendingFileRef = useRef<Map<string, File>>(new Map());
  const pendingAudioRef = useRef<
    Map<string, { bytes: Uint8Array; mime: string; durationMs: number }>
  >(new Map());

  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const photoViewerHostRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const myUserIdRef = useRef<string | null>(null);
  const theirPublicKeyRef = useRef<string | null>(null);
  const myPrivateKeyRef = useRef<string | null>(null);

  // Own optimistic sends keyed by ciphertext|nonce so realtime can reconcile without decrypting.
  const pendingByCipherRef = useRef<
    Map<string, { tempId: string; body: string }>
  >(new Map());
  const initialMessageIdsRef = useRef<Set<string> | null>(null);
  const [loadedConversationId, setLoadedConversationId] = useState<
    string | null
  >(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasMoreHistoryRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const historyCursorRef = useRef<HistoryCursor | null>(null);
  const pendingScrollAnchorRef = useRef<ScrollAnchor | null>(null);
  const conversationIdRef = useRef(conversationId);

  useLayoutEffect(() => {
    setStatus("loading");
    setMessages([]);
    setError(null);
    setOtherUsername("");
    setOtherUserId(null);
    setOtherAvatarId(null);
    setLoadedConversationId(null);
    setHasMoreHistory(true);
    setLoadingOlder(false);
    initialMessageIdsRef.current = null;
    hasMoreHistoryRef.current = true;
    loadingOlderRef.current = false;
    historyCursorRef.current = null;
    pendingScrollAnchorRef.current = null;
    pendingFileRef.current.clear();
    pendingAudioRef.current.clear();
  }, [conversationId]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    hasMoreHistoryRef.current = hasMoreHistory;
  }, [hasMoreHistory]);

  const {
    scrollerRef,
    contentRef,
    paneStyle,
    isAnchoring,
    isAnchoringRef,
    scrollToBottom,
    isNearBottom,
  } = useConversationAnchoring(
    conversationId,
    status === "ready" && loadedConversationId === conversationId,
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
  }, [conversationId]);

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

    const theirKey = theirPublicKeyRef.current;
    const myKey = myPrivateKeyRef.current;
    if (!theirKey || !myKey) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const supabase = createClient();
      const { data: rows, error: messagesError } = await supabase
        .from("messages")
        .select("id, sender_id, ciphertext, nonce, created_at")
        .eq("conversation_id", conversationIdRef.current)
        .or(olderThanOrFilter(cursor))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);

      if (messagesError) return;

      const newestFirst = (rows ?? []) as EncryptedMessageRow[];
      if (newestFirst.length < PAGE_SIZE) {
        hasMoreHistoryRef.current = false;
        setHasMoreHistory(false);
      }
      if (newestFirst.length === 0) return;

      const startedFor = conversationIdRef.current;
      const chronological = chronologicalAsc(newestFirst);
      const decrypted = await decryptMessageBatch(
        chronological,
        theirKey,
        myKey,
      );

      if (conversationIdRef.current !== startedFor) return;

      const fresh = decrypted.filter((m) => !seenIdsRef.current.has(m.id));
      for (const m of fresh) {
        seenIdsRef.current.add(m.id);
        initialMessageIdsRef.current?.add(m.id);
      }

      historyCursorRef.current = cursorFromOldestRow(chronological[0]);

      if (fresh.length === 0) return;

      pendingScrollAnchorRef.current = captureScrollAnchor(scrollerRef.current);
      setMessages((prev) => [...fresh, ...prev]);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [isAnchoringRef, scrollerRef]);

  useEffect(() => {
    if (status !== "ready" || loadedConversationId !== conversationId) return;
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
    loadedConversationId,
    conversationId,
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
      seenIdsRef.current = new Set();
      pendingByCipherRef.current.clear();
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

        const { data: conversation, error: convError } = await supabase
          .from("conversations")
          .select("id, participant_a, participant_b")
          .eq("id", conversationId)
          .maybeSingle();

        if (convError || !conversation) {
          if (!cancelled) {
            setError("Conversation not found.");
            setStatus("error");
          }
          return;
        }

        const isParticipant =
          conversation.participant_a === user.id ||
          conversation.participant_b === user.id;

        if (!isParticipant) {
          if (!cancelled) {
            setError("You are not a participant in this conversation.");
            setStatus("error");
          }
          return;
        }

        const otherId =
          conversation.participant_a === user.id
            ? conversation.participant_b
            : conversation.participant_a;

        const { data: otherProfile, error: profileError } = await supabase
          .from("profiles")
          .select("username, public_key, avatar_id")
          .eq("id", otherId)
          .single();

        if (profileError || !otherProfile?.public_key) {
          if (!cancelled) {
            setError("Could not load the other user's encryption key.");
            setStatus("error");
          }
          return;
        }

        const { data: rows, error: messagesError } = await supabase
          .from("messages")
          .select("id, sender_id, ciphertext, nonce, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(PAGE_SIZE);

        if (messagesError) {
          if (!cancelled) {
            setError("Could not load messages.");
            setStatus("error");
          }
          return;
        }

        const newestFirst = (rows ?? []) as EncryptedMessageRow[];
        const chronological = chronologicalAsc(newestFirst);
        const decrypted = await decryptMessageBatch(
          chronological,
          otherProfile.public_key,
          privateKey,
        );

        if (cancelled) return;

        for (const m of decrypted) {
          seenIdsRef.current.add(m.id);
        }

        historyCursorRef.current = cursorFromOldestRow(chronological[0]);
        const more = newestFirst.length >= PAGE_SIZE;
        hasMoreHistoryRef.current = more;
        setHasMoreHistory(more);

        setMyUserId(user.id);
        setTheirPublicKey(otherProfile.public_key);
        setMyPrivateKey(privateKey);
        myUserIdRef.current = user.id;
        theirPublicKeyRef.current = otherProfile.public_key;
        myPrivateKeyRef.current = privateKey;
        setOtherUsername(otherProfile.username);
        setOtherUserId(otherId as string);
        setOtherAvatarId((otherProfile.avatar_id as string | null) ?? null);
        setMessages(decrypted);
        setLoadedConversationId(conversationId);
        setStatus("ready");

        channel = supabase
          .channel(`messages:${conversationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              void (async () => {
                const row = payload.new as EncryptedMessageRow;
                if (!row?.id || seenIdsRef.current.has(row.id)) return;

                // Own optimistic send reconciliation:
                // if we recognize the ciphertext+nonce pair, reuse our plaintext
                // (and don't decrypt).
                const myId = myUserIdRef.current;
                if (myId && row.sender_id === myId) {
                  const cipherKey = `${row.ciphertext}|${row.nonce}`;
                  const pending = pendingByCipherRef.current.get(cipherKey);
                  if (pending) {
                    pendingByCipherRef.current.delete(cipherKey);
                    seenIdsRef.current.add(row.id);
                    if (cancelled) return;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === pending.tempId
                          ? { ...m, id: row.id, createdAt: row.created_at, failed: false }
                          : m,
                      ),
                    );
                    return;
                  }
                }

                seenIdsRef.current.add(row.id);

                const display = await decryptMessageRow(
                  row,
                  otherProfile.public_key,
                  privateKey,
                );

                if (cancelled) return;

                setMessages((prev) => {
                  if (prev.some((m) => m.id === display.id)) return prev;
                  return [...prev, display];
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
  }, [conversationId, requireKeyImport]);

  const sendPlaintext = useCallback(
    (
      text: string,
      existingId?: string,
      options?: { manageSendingState?: boolean; preservePreview?: boolean },
    ) => {
      const manageSendingState = options?.manageSendingState !== false;
      const myId = myUserIdRef.current;
      if (!myId) return;

      const tempId =
        existingId ??
        `local:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const optimisticCreatedAt = new Date().toISOString();

      // Optimistic UI: show immediately (no decrypt, no waiting).
      setMessages((prev) => {
        if (existingId) {
          return prev.map((m) =>
            m.id === existingId
              ? {
                  ...m,
                  body: text,
                  createdAt: optimisticCreatedAt,
                  failed: false,
                }
              : m,
          );
        }
        if (prev.some((m) => m.id === tempId)) return prev;
        return [
          ...prev,
          { id: tempId, senderId: myId, body: text, createdAt: optimisticCreatedAt },
        ];
      });

      void (async () => {
        if (manageSendingState) {
          setSending(true);
        }
        let cipherKey: string | null = null;

        try {
          const myIdForKey = myUserIdRef.current;
          if (!myIdForKey || !(await hasPrivateKey(myIdForKey))) {
            requireKeyImport();
            return;
          }

          const theirKey = theirPublicKeyRef.current;
          const myKey = myPrivateKeyRef.current;
          if (!myKey) {
            requireKeyImport();
            return;
          }
          if (!theirKey) {
            throw new Error("Recipient public key missing");
          }

          // Encrypt before insert so we know the ciphertext/nonce for reconciliation.
          const { ciphertext, nonce } = await encryptMessage(
            text,
            theirKey,
            myKey,
          );
          cipherKey = `${ciphertext}|${nonce}`;
          pendingByCipherRef.current.set(cipherKey, { tempId, body: text });

          const supabase = createClient();
          const { data: inserted, error: insertError } = await supabase
            .from("messages")
            .insert({
              conversation_id: conversationId,
              sender_id: myId,
              ciphertext,
              nonce,
            })
            .select("id, sender_id, ciphertext, nonce, created_at")
            .single();

          if (insertError || !inserted) {
            throw new Error("Could not send message");
          }

          pendingByCipherRef.current.delete(cipherKey);
          seenIdsRef.current.add(inserted.id);

          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    id: inserted.id,
                    createdAt: inserted.created_at,
                    failed: false,
                  }
                : m,
            ),
          );
          pendingFileRef.current.delete(tempId);
          pendingAudioRef.current.delete(tempId);
        } catch {
          // If encryption/key is the issue, route to import screen.
          const myIdForKey = myUserIdRef.current;
          if (!myIdForKey || !(await hasPrivateKey(myIdForKey))) {
            requireKeyImport();
            return;
          }

          if (cipherKey) {
            pendingByCipherRef.current.delete(cipherKey);
          }

          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, failed: true } : m)),
          );
        } finally {
          if (manageSendingState) {
            setSending(false);
          }
        }
      })();

      return tempId;
    },
    [conversationId, requireKeyImport],
  );

  const runVideoSend = useCallback(
    async (file: File, existingId?: string) => {
      const myId = myUserIdRef.current;
      if (!myId) return;

      setAttachError(null);
      setAttachUploading(true);

      const tempId =
        existingId ??
        `local:${Date.now()}:${Math.random().toString(16).slice(2)}`;

      pendingFileRef.current.set(tempId, file);

      if (file.size > 50 * 1024 * 1024) {
        setAttachError("Videos must be under 50MB.");
        setAttachUploading(false);
        return;
      }

      if (!existingId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === tempId)) return prev;
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
            m.id === existingId
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
            m.id === tempId
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

        sendPlaintext(body, tempId, {
          manageSendingState: false,
          preservePreview: true,
        });
      } catch (err) {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        if (
          err instanceof VideoTooLargeError ||
          err instanceof VideoUnsupportedError
        ) {
          setAttachError(err.message);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          pendingFileRef.current.delete(tempId);
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, failed: true } : m)),
        );
      } finally {
        setAttachUploading(false);
      }
    },
    [sendPlaintext],
  );

  const runAudioSend = useCallback(
    async (payload: VoiceRecordingPayload, existingId?: string) => {
      const myId = myUserIdRef.current;
      if (!myId) return;

      setAttachError(null);
      setAttachUploading(true);

      const tempId =
        existingId ??
        `local:${Date.now()}:${Math.random().toString(16).slice(2)}`;

      pendingAudioRef.current.set(tempId, payload);

      if (!existingId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === tempId)) return prev;
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
            m.id === existingId
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

        sendPlaintext(body, tempId, {
          manageSendingState: false,
          preservePreview: true,
        });
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, failed: true } : m)),
        );
      } finally {
        setAttachUploading(false);
      }
    },
    [sendPlaintext],
  );

  const runAttachmentSend = useCallback(
    async (file: File, existingId?: string) => {
      const myId = myUserIdRef.current;
      if (!myId) return;

      setAttachError(null);
      setAttachUploading(true);

      const tempId =
        existingId ??
        `local:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);
      pendingFileRef.current.set(tempId, file);

      if (!existingId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === tempId)) return prev;
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
            m.id === existingId
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

        sendPlaintext(body, tempId, {
          manageSendingState: false,
          preservePreview: true,
        });
      } catch (err) {
        if (err instanceof ImageTooLargeError) {
          setAttachError(err.message);
          URL.revokeObjectURL(previewUrl);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          pendingFileRef.current.delete(tempId);
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, failed: true } : m)),
        );
      } finally {
        setAttachUploading(false);
      }
    },
    [sendPlaintext],
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
      sendPlaintext(text);
    },
    [sendPlaintext],
  );

  const handleRetry = useCallback(
    (id: string) => {
      const audio = pendingAudioRef.current.get(id);
      if (audio) {
        void runAudioSend(audio, id);
        return;
      }
      const file = pendingFileRef.current.get(id);
      if (file) {
        if (file.type.startsWith("video/")) {
          void runVideoSend(file, id);
        } else {
          void runAttachmentSend(file, id);
        }
        return;
      }
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) return;
      sendPlaintext(msg.body, id);
    },
    [sendPlaintext, runAttachmentSend, runVideoSend, runAudioSend],
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

  const otherNickname = otherUserId ? getNickname(otherUserId) : null;
  const otherIdentity = {
    username: otherUsername,
    nickname: otherNickname,
  };
  const otherDisplayName = displayName(otherIdentity);
  const otherHasNickname = hasNickname(otherIdentity);

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
            onClick={() => setContactDetailOpen(true)}
            disabled={!otherUserId}
            className="row-press flex min-h-11 min-w-0 flex-1 items-center gap-[var(--sp-2)] rounded-[var(--radius-input)] text-left disabled:opacity-60"
          >
            <Avatar avatarId={otherAvatarId} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[length:var(--text-title)] font-semibold leading-tight text-[var(--text-primary)]">
                {otherDisplayName}
              </p>
              <p className="flex items-center gap-[var(--sp-1)] text-[length:var(--text-caption)] leading-tight text-[var(--text-secondary)]">
                <LockIcon className="h-3 w-3 shrink-0" />
                End-to-end encrypted
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
              <Avatar avatarId={otherAvatarId} size={48} />
              <p className="text-[length:var(--text-secondary-size)] font-semibold text-[var(--text-primary)]">
                {otherDisplayName}
              </p>
              {otherHasNickname ? (
                <p className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                  {formatAtUsername(otherUsername)}
                </p>
              ) : null}
              <p className="max-w-[220px] text-[length:var(--text-secondary-size)] leading-[1.4] text-[var(--text-secondary)]">
                Messages are end-to-end encrypted.
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
                      localPreviewUrl={m.localPreviewUrl}
                      pendingAttachment={m.pendingAttachment}
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

      {contactDetailOpen && otherUserId ? (
        <ContactDetail
          contactId={otherUserId}
          username={otherUsername}
          avatarId={otherAvatarId}
          onClose={() => setContactDetailOpen(false)}
        />
      ) : null}
      <div
        ref={photoViewerHostRef}
        className="pointer-events-none absolute inset-0 z-[60] [&>*]:pointer-events-auto"
      />
    </div>
    </PhotoViewerHostProvider>
  );
}
