"use client";

import { Avatar, AVATARS, type AvatarDef } from "@/lib/avatars";

export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-4 gap-3 sm:grid-cols-6"
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
            onClick={() => onChange(avatar.id)}
            className={`flex min-h-11 flex-col items-center gap-1.5 rounded-2xl p-2 transition-colors duration-150 ${
              selected
                ? "bg-[#292524] ring-2 ring-[#EA580C] ring-offset-2 ring-offset-[#1C1917]"
                : "hover:bg-[#292524]/70"
            }`}
          >
            <Avatar avatarId={avatar.id} size={48} />
            <span className="text-[11px] font-medium capitalize text-[#A8A29E]">
              {avatar.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
