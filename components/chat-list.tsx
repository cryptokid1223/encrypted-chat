"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { orderedParticipants } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";

type ConversationRow = {
  id: string;
  otherUsername: string;
};

export function ChatList() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);

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

      const { data: rows, error: convError } = await supabase
        .from("conversations")
        .select("id, participant_a, participant_b, created_at")
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (convError) {
        setListError("Could not load conversations.");
        return;
      }

      if (!rows || rows.length === 0) {
        setConversations([]);
        return;
      }

      const otherIds = rows.map((row) =>
        row.participant_a === user.id ? row.participant_b : row.participant_a,
      );

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", otherIds);

      if (profileError) {
        setListError("Could not load usernames.");
        return;
      }

      const nameById = new Map(
        (profiles ?? []).map((p) => [p.id as string, p.username as string]),
      );

      setConversations(
        rows.map((row) => {
          const otherId =
            row.participant_a === user.id
              ? row.participant_b
              : row.participant_a;
          return {
            id: row.id as string,
            otherUsername: nameById.get(otherId as string) ?? "Unknown",
          };
        }),
      );
    } catch {
      setListError("Could not load conversations.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleaned = username.trim().toLowerCase();
    if (!cleaned) {
      setError("Enter a username.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Not signed in.");
        return;
      }

      const { data: profile, error: lookupError } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", cleaned)
        .maybeSingle();

      if (lookupError) {
        setError("Could not look up that user. Try again.");
        return;
      }

      if (!profile) {
        setError("No user with that username.");
        return;
      }

      if (profile.id === user.id) {
        setError("You can't start a chat with yourself.");
        return;
      }

      const [participant_a, participant_b] = orderedParticipants(
        user.id,
        profile.id as string,
      );

      const { data: existing, error: findError } = await supabase
        .from("conversations")
        .select("id")
        .eq("participant_a", participant_a)
        .eq("participant_b", participant_b)
        .maybeSingle();

      if (findError) {
        setError("Could not open conversation. Try again.");
        return;
      }

      if (existing) {
        router.push(`/chats/${existing.id}`);
        return;
      }

      const { data: created, error: createError } = await supabase
        .from("conversations")
        .insert({ participant_a, participant_b })
        .select("id")
        .single();

      if (createError) {
        // Race: another request may have created it.
        const { data: raced } = await supabase
          .from("conversations")
          .select("id")
          .eq("participant_a", participant_a)
          .eq("participant_b", participant_b)
          .maybeSingle();

        if (raced) {
          router.push(`/chats/${raced.id}`);
          return;
        }

        setError("Could not create conversation. Try again.");
        return;
      }

      router.push(`/chats/${created.id}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Chats</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Start a conversation by exact username
        </p>
      </div>

      <form onSubmit={startChat} className="border border-neutral-300 bg-white p-4">
        <label htmlFor="new-chat-user" className="mb-1.5 block text-sm font-medium text-neutral-800">
          New chat
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="new-chat-user"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="username"
            autoComplete="off"
            className="w-full border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-[#EA580C]"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 border border-[#EA580C] bg-[#EA580C] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Opening…" : "Start"}
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-800">Your conversations</h2>
        {loadingList ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : listError ? (
          <p className="text-sm text-red-700" role="alert">
            {listError}
          </p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-neutral-600">No conversations yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 border border-neutral-300 bg-white">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chats/${c.id}`}
                  className="block px-4 py-3 text-neutral-900 hover:bg-neutral-50"
                >
                  {c.otherUsername}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
