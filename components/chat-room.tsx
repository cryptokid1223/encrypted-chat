"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, LockIcon, SendIcon } from "@/components/icons";
import { formatMessageTime } from "@/lib/chat";
import { decryptMessage, encryptMessage } from "@/lib/crypto";
import { Avatar } from "@/lib/avatars";
import { loadPrivateKey } from "@/lib/keystore";
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
        const privateKey = await loadPrivateKey();
        if (!privateKey) {
          if (!cancelled) {
            setError("Private key missing on this device.");
            setStatus("error");
          }
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
  }, [conversationId]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);

    const text = draft.trim();
    if (!text || !myUserId || !theirPublicKey || !myPrivateKey) return;

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
      setSendError("Could not encrypt or send message.");
    } finally {
      setSending(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-[#A8A29E]">
        Loading chat…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-start gap-4 p-6">
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
        <Link
          href="/chats"
          className="text-sm font-medium text-[#EA580C] transition-colors duration-150 hover:text-[#C2410C]"
        >
          Back to chats
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-[#0C0A09]">
      <div className="safe-pt flex items-center gap-2 border-b border-[#292524] bg-[#1C1917] px-2 py-2">
        <Link
          href="/chats"
          aria-label="Back to chats"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#A8A29E] transition-colors duration-150 hover:bg-[#292524] hover:text-[#FAFAF9] md:hidden"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <Avatar avatarId={otherAvatarId} size={36} />
        <div className="min-w-0 flex-1 pr-3">
          <h1 className="truncate text-[15px] font-semibold text-[#FAFAF9]">
            {otherUsername}
          </h1>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#A8A29E]">
            <LockIcon className="h-3 w-3" />
            End-to-end encrypted
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Avatar avatarId={otherAvatarId} size={64} />
            <p className="text-sm font-medium text-[#FAFAF9]">{otherUsername}</p>
            <p className="max-w-[240px] text-[13px] leading-relaxed text-[#A8A29E]">
              Messages are end-to-end encrypted. Only you two can read them.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {messages.map((m, i) => {
              const mine = m.senderId === myUserId;
              const prev = messages[i - 1];
              const sameAsPrev = prev?.senderId === m.senderId;
              const next = messages[i + 1];
              const sameAsNext = next?.senderId === m.senderId;

              return (
                <li
                  key={m.id}
                  className={`flex flex-col ${mine ? "items-end" : "items-start"} ${
                    sameAsPrev ? "mt-0.5" : "mt-3"
                  }`}
                >
                  <div
                    className={
                      mine
                        ? `max-w-[75%] bg-[#EA580C] px-3.5 py-2 text-[15px] leading-relaxed text-white ${
                            sameAsPrev && sameAsNext
                              ? "rounded-2xl rounded-r-md"
                              : sameAsPrev
                                ? "rounded-2xl rounded-tr-md"
                                : sameAsNext
                                  ? "rounded-2xl rounded-br-md"
                                  : "rounded-2xl rounded-br-sm"
                          }`
                        : `max-w-[75%] bg-[#292524] px-3.5 py-2 text-[15px] leading-relaxed text-[#FAFAF9] ${
                            sameAsPrev && sameAsNext
                              ? "rounded-2xl rounded-l-md"
                              : sameAsPrev
                                ? "rounded-2xl rounded-tl-md"
                                : sameAsNext
                                  ? "rounded-2xl rounded-bl-md"
                                  : "rounded-2xl rounded-bl-sm"
                          }`
                    }
                  >
                    {m.body}
                  </div>
                  {!sameAsNext ? (
                    <span className="mt-1 px-1 text-[11px] text-[#78716C]">
                      {formatMessageTime(m.createdAt)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="safe-pb sticky bottom-0 border-t border-[#292524] bg-[#0C0A09] px-3 pt-3"
      >
        <div className="flex items-end gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-[#292524] bg-[#1C1917] px-4 py-2.5 text-[15px] text-[#FAFAF9] placeholder:text-[#78716C] outline-none transition-[border-color] duration-150 focus:border-[#EA580C]"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EA580C] text-white transition-colors duration-150 hover:bg-[#C2410C] disabled:opacity-40"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
        {sendError ? (
          <p className="mt-2 px-1 text-sm text-red-400" role="alert">
            {sendError}
          </p>
        ) : null}
      </form>
    </div>
  );
}
