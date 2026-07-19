"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMessageTime } from "@/lib/chat";
import { decryptMessage, encryptMessage } from "@/lib/crypto";
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
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;

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

        const supabase = createClient();
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
          .select("username, public_key")
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
                if (!row?.id || seenIdsRef.current.has(row.id)) return;
                seenIdsRef.current.add(row.id);
                const display = await decryptRow(
                  row,
                  otherProfile.public_key,
                  privateKey,
                );
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
        const supabase = createClient();
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
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-neutral-600">
        Loading chat…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-4 p-6">
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
        <Link href="/chats" className="text-sm font-medium text-[#EA580C] hover:underline">
          Back to chats
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-300 bg-white px-4 py-3">
        <Link href="/chats" className="text-sm text-neutral-600 hover:text-[#EA580C]">
          ←
        </Link>
        <h1 className="text-base font-semibold text-neutral-900">{otherUsername}</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-neutral-500">
            No messages yet. Say hello.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => {
              const mine = m.senderId === myUserId;
              return (
                <li
                  key={m.id}
                  className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={
                      mine
                        ? "max-w-[85%] bg-[#EA580C] px-3 py-2 text-sm text-white sm:max-w-[70%]"
                        : "max-w-[85%] border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 sm:max-w-[70%]"
                    }
                  >
                    {m.body}
                  </div>
                  <span className="mt-1 text-xs text-neutral-500">
                    {formatMessageTime(m.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="border-t border-neutral-300 bg-white p-3 sm:p-4"
      >
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message"
            autoComplete="off"
            className="min-w-0 flex-1 border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-[#EA580C]"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="shrink-0 border border-[#EA580C] bg-[#EA580C] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
        {sendError ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {sendError}
          </p>
        ) : null}
      </form>
    </div>
  );
}
