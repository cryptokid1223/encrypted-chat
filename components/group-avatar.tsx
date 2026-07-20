"use client";

import { Avatar } from "@/lib/avatars";
import { PeopleIcon } from "@/components/icons";

export function GroupAvatar({
  avatarId,
  size = 48,
  className = "",
}: {
  avatarId: string | null;
  size?: number;
  className?: string;
}) {
  if (avatarId) {
    return <Avatar avatarId={avatarId} size={size} className={className} />;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--divider)] bg-[var(--surface)] text-[var(--text-secondary)] ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Group"
    >
      <PeopleIcon className="h-[45%] w-[45%]" />
    </span>
  );
}
