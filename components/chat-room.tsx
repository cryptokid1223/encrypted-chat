"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, LockIcon, SendIcon } from "@/components/icons";
import { useKeyGate } from "@/components/key-gate";
import {
  formatDayDivider,
  formatMessageTime,
  isSameCalendarDay,
  isSameMessageGroup,
} from "@/lib/chat";
import { decryptMessage, encryptMessage } from "@/lib/crypto";
import { Avatar } from "@/lib/avatars";
import { hasPrivateKey, loadPrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

type DisplayMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

type EncryptedRow = {
  id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
};

async function decryptRow(
  row: EncryptedRow,
  theirPublicKey: string,
  myPrivateKey: string,
): Promise<DisplayMessage> {
  try {
    const body = await decryptMessage(
      row.ciphertext,
      row.nonce,
      theirPublicKey,
      myPrivateKey,
    );
    return {
      id: row.id,
      senderId: row.sender_id,
      body,
      createdAt: row.created_at,
    };
  } catch {
    return {
      id: row.id,
      senderId: row.sender_id,
      body: "[unable to decrypt]",
      createdAt: row.created_at,
    };
  }
}

export function ChatRoom() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const { requireKeyImport } = useKeyGate();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [otherUsername, setOtherUsername] = useState("");
  const [otherAvatarId, setOtherAvatarId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [theirPublicKey, setTheirPublicKey] = useState<string | null>(null);
  const [myPrivateKey, setMyPrivateKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      setStatus("loading");
      setError(null);
      seenIdsRef.current = new Set();

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

        const decrypted = await Promise.all(
          (rows ?? []).map((row) =>
            decryptRow(row as EncryptedRow, otherProfile.public_key, privateKey),
          ),
        );

        if (cancelled) return;

        for (const m of decrypted) {
          seenIdsRef.current.add(m.id);
        }

        setMyUserId(user.id);
        setTheirPublicKey(otherProfile.public_key);
        setMyPrivateKey(privateKey);
        setOtherUsername(otherProfile.username);
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
                const row = payload.new as EncryptedRow;
                // Skip duplicates from optimistic send + realtime echo.
                if (!row?.id || seenIdsRef.current.has(row.id)) return;
                seenIdsRef.current.add(row.id);

                const display = await decryptRow(
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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);

    const text = draft.trim();
    if (!text || !myUserId || !theirPublicKey) return;

    if (!(await hasPrivateKey()) || !myPrivateKey) {
      requireKeyImport();
      return;
    }

    setSending(true);
    try {
      // Encrypt client-side only — never send plaintext to Supabase.
      const { ciphertext, nonce } = await encryptMessage(
        text,
        theirPublicKey,
        myPrivateKey,
      );

      const supabase = createClient();
      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: myUserId,
          ciphertext,
          nonce,
        })
        .select("id, sender_id, ciphertext, nonce, created_at")
        .single();

      if (insertError || !inserted) {
        setSendError("Could not send message. Try again.");
        return;
      }

      const display = await decryptRow(
        inserted as EncryptedRow,
        theirPublicKey,
        myPrivateKey,
      );
      seenIdsRef.current.add(display.id);
      setMessages((prev) => {
        if (prev.some((m) => m.id === display.id)) return prev;
        return [...prev, display];
      });
      setDraft("");
    } catch {
      // Never surface a raw crypto failure — force key import with toast.
      requireKeyImport();
    } finally {
      setSending(false);
    }
  }

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

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-[#0F0E0D]">
      <div className="safe-pt shrink-0 border-b border-[#2E2B28] bg-[#1A1816]">
        <div className="flex h-14 items-center gap-2.5 px-3">
          <Link
            href="/chats"
            aria-label="Back to chats"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9] md:hidden"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <Avatar avatarId={otherAvatarId} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-[1.4] text-[#FAFAF9]">
              {otherUsername}
            </p>
            <p className="flex items-center gap-1 text-[12px] leading-[1.4] text-[#6E6963]">
              <LockIcon className="h-3 w-3" />
              End-to-end encrypted
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-3">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <Avatar avatarId={otherAvatarId} size={48} />
              <p className="text-[14px] font-medium text-[#FAFAF9]">
                {otherUsername}
              </p>
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
                    {showDayDivider ? (
                      <div className="my-4 flex justify-center">
                        <span className="text-[12px] text-[#6E6963]">
                          {formatDayDivider(m.createdAt)}
                        </span>
                      </div>
                    ) : null}
                    <div
                      className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                      style={{
                        marginTop: showDayDivider
                          ? 0
                          : sameGroupPrev
                            ? 2
                            : 16,
                      }}
                    >
                      <div
                        className={`max-w-[65%] px-[14px] py-[10px] text-[15px] leading-[1.4] ${bubbleRadius} ${
                          mine
                            ? "bg-[#EA580C] text-white"
                            : "bg-[#242220] text-[#FAFAF9]"
                        }`}
                      >
                        {m.body}
                      </div>
                      {!sameGroupNext ? (
                        <span className="mt-1 px-1 text-[11px] text-[#6E6963]">
                          {formatMessageTime(m.createdAt)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={sendMessage}
        className="safe-pb shrink-0 border-t border-[#2E2B28] bg-[#0F0E0D]"
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-2.5">
          <div className="relative flex items-center">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message"
              autoComplete="off"
              className={`h-11 w-full rounded-full border border-[#2E2B28] bg-[#242220] py-2.5 text-[14px] leading-[1.4] text-[#FAFAF9] placeholder:text-[#6E6963] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C] ${
                draft.trim() ? "pl-4 pr-12" : "px-4"
              }`}
            />
            {draft.trim() ? (
              <button
                type="submit"
                disabled={sending}
                aria-label="Send"
                className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#EA580C] text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C] disabled:opacity-40"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {sendError ? (
            <p className="mt-1.5 px-1 text-[13px] text-red-400" role="alert">
              {sendError}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
