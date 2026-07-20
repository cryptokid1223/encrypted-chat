"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, LockIcon } from "@/components/icons";
import { ContactDetail } from "@/components/contact-detail";
import { useKeyGate } from "@/components/key-gate";
import { useNicknames } from "@/components/nicknames-context";
import { isSameCalendarDay, isSameMessageGroup } from "@/lib/chat";
import { encryptMessage } from "@/lib/crypto";
import { Avatar } from "@/lib/avatars";
import {
  displayName,
  formatAtUsername,
  hasNickname,
} from "@/lib/display-name";
import { hasPrivateKey, loadPrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "@/components/message-bubble";
import { ChatComposer } from "@/components/chat-composer";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import type {
  DecryptedMessage,
  EncryptedMessageRow,
} from "@/lib/message-decrypt";
import {
  decryptMessageBatch,
  decryptMessageRow,
} from "@/lib/message-decrypt";

type DisplayMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  failed?: boolean;
};

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

  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const myUserIdRef = useRef<string | null>(null);
  const theirPublicKeyRef = useRef<string | null>(null);
  const myPrivateKeyRef = useRef<string | null>(null);

  // Own optimistic sends keyed by ciphertext|nonce so realtime can reconcile without decrypting.
  const pendingByCipherRef = useRef<
    Map<string, { tempId: string; body: string }>
  >(new Map());

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return true;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining < 180;
  }, []);

  useEffect(() => {
    if (!isNearBottom()) return;
    scrollToBottom();
  }, [messages, isNearBottom, scrollToBottom]);

  const scrollIfNearBottom = useCallback(() => {
    if (isNearBottom()) scrollToBottom();
  }, [isNearBottom, scrollToBottom]);

  useVisualViewport(scrollIfNearBottom);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      setStatus("loading");
      setError(null);
      seenIdsRef.current = new Set();
      pendingByCipherRef.current.clear();

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
          .order("created_at", { ascending: true });

        if (messagesError) {
          if (!cancelled) {
            setError("Could not load messages.");
            setStatus("error");
          }
          return;
        }

        const decrypted = await decryptMessageBatch(
          (rows ?? []) as EncryptedMessageRow[],
          otherProfile.public_key,
          privateKey,
        );

        if (cancelled) return;

        for (const m of decrypted) {
          seenIdsRef.current.add(m.id);
        }

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
    (text: string, existingId?: string) => {
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
              ? { ...m, body: text, createdAt: optimisticCreatedAt, failed: false }
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
        setSending(true);
        let cipherKey: string | null = null;

        try {
          if (!(await hasPrivateKey())) {
            requireKeyImport();
            return;
          }

          const theirKey = theirPublicKeyRef.current;
          const myKey = myPrivateKeyRef.current;
          if (!theirKey || !myKey) {
            requireKeyImport();
            return;
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
                ? { ...m, id: inserted.id, createdAt: inserted.created_at, failed: false }
                : m,
            ),
          );
        } catch (err) {
          // If encryption/key is the issue, route to import screen.
          if (!(await hasPrivateKey())) {
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
          setSending(false);
        }
      })();
    },
    [conversationId, requireKeyImport],
  );

  const handleSend = useCallback(
    (text: string) => {
      sendPlaintext(text);
    },
    [sendPlaintext],
  );

  const handleRetry = useCallback(
    (id: string) => {
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) return;
      sendPlaintext(msg.body, id);
    },
    [sendPlaintext],
  );

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-[#6E6963]">
        Loading chat…
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
          className="text-[13px] font-medium text-[#EA580C] transition-colors duration-150 ease-in-out hover:text-[#C2410C]"
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
    <div className="flex h-app min-h-0 w-full flex-col bg-[#0F0E0D] md:h-full md:flex-1">
      <div className="safe-pt shrink-0 border-b border-[#2E2B28] bg-[#1A1816]">
        <div className="flex h-14 items-center gap-2.5 px-3">
          <Link
            href="/chats"
            aria-label="Back to chats"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9] md:hidden"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={() => setContactDetailOpen(true)}
            disabled={!otherUserId}
            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left transition-colors duration-150 ease-in-out hover:bg-[#242220]/50 active:bg-[#242220] disabled:opacity-60"
          >
            <Avatar avatarId={otherAvatarId} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-[1.4] text-[#FAFAF9]">
                {otherDisplayName}
              </p>
              {otherHasNickname ? (
                <p className="truncate text-[12px] leading-[1.4] text-[#6E6963]">
                  {formatAtUsername(otherUsername)}
                </p>
              ) : (
                <p className="flex items-center gap-1 text-[12px] leading-[1.4] text-[#6E6963]">
                  <LockIcon className="h-3 w-3" />
                  End-to-end encrypted
                </p>
              )}
            </div>
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "none" }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-3">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <Avatar avatarId={otherAvatarId} size={48} />
              <p className="text-[14px] font-medium text-[#FAFAF9]">
                {otherDisplayName}
              </p>
              {otherHasNickname ? (
                <p className="text-[13px] text-[#6E6963]">
                  {formatAtUsername(otherUsername)}
                </p>
              ) : null}
              <p className="max-w-[220px] text-[13px] leading-[1.4] text-[#6E6963]">
                Messages are end-to-end encrypted.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {messages.map((m, i) => {
                const mine = m.senderId === myUserId;
                const prev = messages[i - 1];
                const next = messages[i + 1];

                const sameGroupPrev = prev
                  ? isSameMessageGroup(
                      prev.senderId,
                      prev.createdAt,
                      m.senderId,
                      m.createdAt,
                    )
                  : false;
                const sameGroupNext = next
                  ? isSameMessageGroup(
                      m.senderId,
                      m.createdAt,
                      next.senderId,
                      next.createdAt,
                    )
                  : false;

                const showDayDivider =
                  !prev || !isSameCalendarDay(prev.createdAt, m.createdAt);

                const bubbleRadius = mine
                  ? sameGroupPrev && sameGroupNext
                    ? "rounded-[18px] rounded-r-[4px]"
                    : sameGroupPrev
                      ? "rounded-[18px] rounded-tr-[4px]"
                      : "rounded-[18px] rounded-br-[4px]"
                  : sameGroupPrev && sameGroupNext
                    ? "rounded-[18px] rounded-l-[4px]"
                    : sameGroupPrev
                      ? "rounded-[18px] rounded-tl-[4px]"
                      : "rounded-[18px] rounded-bl-[4px]";

                return (
                  <li key={m.id}>
                    <MessageBubble
                      id={m.id}
                      body={m.body}
                      isMine={mine}
                      timestamp={m.createdAt}
                      showDayDivider={showDayDivider}
                      showTimestamp={!sameGroupNext}
                      bubbleRadius={bubbleRadius}
                      marginTop={
                        showDayDivider ? 0 : sameGroupPrev ? 2 : 16
                      }
                      failed={m.failed}
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

      <ChatComposer onSend={handleSend} disabled={sending} />

      {contactDetailOpen && otherUserId ? (
        <ContactDetail
          contactId={otherUserId}
          username={otherUsername}
          avatarId={otherAvatarId}
          onClose={() => setContactDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
