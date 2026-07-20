"use client";

import { Avatar, AVATARS, type AvatarDef } from "@/lib/avatars";
import { CheckIcon } from "@/components/icons";

export function AvatarPicker({
  value,
  onChange,
  size = 60,
  showLabels = true,
  columns = "auth",
}: {
  value: string;
  onChange: (id: string) => void;
  size?: number;
  showLabels?: boolean;
  columns?: "auth" | "settings";
}) {
  const grid =
    columns === "settings"
      ? "grid-cols-4 gap-[var(--sp-3)]"
      : "grid-cols-4 gap-2.5 sm:grid-cols-6 sm:gap-3";

  return (
    <div
      className={`grid ${grid}`}
      role="listbox"
      aria-label="Choose your avatar"
    >
      {AVATARS.map((avatar: AvatarDef) => {
        const selected = value === avatar.id;
        return (
          <button
            key={avatar.id}
            type="button"
            role="option"
            aria-selected={selected}
            title={avatar.name}
            onClick={() => onChange(avatar.id)}
            className={`relative flex flex-col items-center justify-center rounded-full p-0.5 transition-all duration-150 ease-in-out active:scale-95 active:opacity-80 ${
              selected ? "ring-2 ring-[var(--accent)]" : ""
            }`}
          >
            <Avatar avatarId={avatar.id} size={size} />
            {selected ? (
              <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white ring-2 ring-[var(--surface-elevated)]">
                <CheckIcon className="h-3 w-3" />
              </span>
            ) : null}
            {showLabels ? (
              <span className="mt-1 text-[length:var(--text-caption)] font-medium capitalize text-[var(--text-secondary)]">
                {avatar.name}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
