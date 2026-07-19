"use client";

import { Avatar, AVATARS, type AvatarDef } from "@/lib/avatars";

export function AvatarPicker({
  value,
  onChange,
  size = 48,
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
      ? "grid-cols-6 gap-3"
      : "grid-cols-4 gap-2.5 sm:grid-cols-6 sm:gap-3";

  return (
    <div className={`grid ${grid}`} role="listbox" aria-label="Choose your avatar">
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
            className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all duration-150 ease-in-out ${
              selected
                ? "ring-2 ring-[#EA580C]"
                : "hover:bg-[#242220]"
            }`}
          >
            <Avatar avatarId={avatar.id} size={size} />
            {showLabels ? (
              <span className="text-[11px] font-medium capitalize text-[#6E6963]">
                {avatar.name}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
