"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { GroupAvatar } from "@/components/group-avatar";
import { fetchGroupShell } from "@/lib/groups";
import { createClient } from "@/lib/supabase/client";

export function GroupRoom() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setError(null);

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

      const result = await fetchGroupShell(groupId, user.id);
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error);
        setStatus("error");
        return;
      }

      setName(result.name);
      setAvatarId(result.avatarId);
      setMemberCount(result.memberCount);
      setStatus("ready");
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

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
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
            Loading…
          </p>
        </div>
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

  return (
    <div className="screen-enter flex h-app min-h-0 w-full min-w-0 flex-col overflow-x-hidden bg-[var(--bg)] md:h-full md:flex-1">
      <header className="safe-pt shrink-0 border-b border-[var(--divider)] bg-[var(--bg)]">
        <div className="flex h-[52px] items-center gap-[var(--sp-2)] px-[var(--sp-3)]">
          <Link
            href="/chats"
            aria-label="Back to chats"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] md:hidden"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-[var(--sp-2)]">
            <GroupAvatar avatarId={avatarId} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[length:var(--text-title)] font-semibold leading-tight text-[var(--text-primary)]">
                {name}
              </p>
              <p className="text-[length:var(--text-caption)] leading-tight text-[var(--text-secondary)]">
                {memberLabel}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "none" }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-[var(--sp-3)] pb-[var(--sp-2)] pt-[var(--sp-2)]">
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
        </div>
      </div>

      <div className="composer-bar shrink-0 border-t border-[var(--divider)] bg-[var(--bg)] opacity-60">
        <div className="mx-auto flex w-full max-w-3xl px-[var(--sp-3)] py-[var(--sp-2)]">
          <div className="flex min-h-10 w-full items-center rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] py-[var(--sp-2)]">
            <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
              Group messaging coming in next build
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
