import type { ReactNode, SVGProps } from "react";

export type AvatarDef = {
  id: string;
  name: string;
  bg: string;
  Artwork: (props: SVGProps<SVGSVGElement>) => ReactNode;
};

function Art(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

const PRESETS: AvatarDef[] = [
  {
    id: "aurora",
    name: "Aurora",
    bg: "#C4B5A0",
    Artwork: (p) => (
      <Art {...p}>
        <path
          d="M8 44c8-18 16-26 24-26s16 8 24 26"
          stroke="#FFF8F0"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M14 48c6-12 12-18 18-18s12 6 18 18"
          stroke="#FDE68A"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.75"
        />
      </Art>
    ),
  },
  {
    id: "dune",
    name: "Dune",
    bg: "#D6A77A",
    Artwork: (p) => (
      <Art {...p}>
        <path
          d="M4 42c10-8 18-6 28-2s16 6 28 0v16H4V42z"
          fill="#FEF3C7"
          opacity="0.9"
        />
        <path
          d="M4 50c12-6 20-4 30 0s18 4 26-2"
          stroke="#92400E"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.35"
        />
      </Art>
    ),
  },
  {
    id: "tide",
    name: "Tide",
    bg: "#8FA8B8",
    Artwork: (p) => (
      <Art {...p}>
        <path
          d="M6 28c8 8 14 8 22 0s14-8 22 0 8 8 8 8"
          stroke="#E8F4F8"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M6 40c8 8 14 8 22 0s14-8 22 0 8 8 8 8"
          stroke="#D1E8F0"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.75"
        />
      </Art>
    ),
  },
  {
    id: "ember",
    name: "Ember",
    bg: "#C07058",
    Artwork: (p) => (
      <Art {...p}>
        <circle cx="32" cy="34" r="14" fill="#FDBA74" opacity="0.95" />
        <circle cx="32" cy="34" r="8" fill="#FED7AA" />
        <circle cx="44" cy="20" r="4" fill="#FEF3C7" opacity="0.85" />
      </Art>
    ),
  },
  {
    id: "orbit",
    name: "Orbit",
    bg: "#6B7C8F",
    Artwork: (p) => (
      <Art {...p}>
        <circle cx="32" cy="32" r="8" fill="#E7E5E4" />
        <ellipse
          cx="32"
          cy="32"
          rx="22"
          ry="10"
          stroke="#D6D3D1"
          strokeWidth="2.5"
          transform="rotate(-28 32 32)"
        />
        <circle cx="50" cy="24" r="3.5" fill="#FDBA74" />
      </Art>
    ),
  },
  {
    id: "moss",
    name: "Moss",
    bg: "#7D8F74",
    Artwork: (p) => (
      <Art {...p}>
        <circle cx="28" cy="36" r="12" fill="#D1E0C5" />
        <circle cx="40" cy="30" r="10" fill="#BBD0A8" />
        <circle cx="34" cy="40" r="8" fill="#E8F0E0" opacity="0.9" />
      </Art>
    ),
  },
  {
    id: "comet",
    name: "Comet",
    bg: "#7A6B8A",
    Artwork: (p) => (
      <Art {...p}>
        <path
          d="M12 44c10-6 18-16 24-26"
          stroke="#E9D5FF"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.7"
        />
        <circle cx="40" cy="18" r="7" fill="#F5E6FF" />
        <circle cx="40" cy="18" r="3.5" fill="#DDD6FE" />
      </Art>
    ),
  },
  {
    id: "fern",
    name: "Fern",
    bg: "#6E8B74",
    Artwork: (p) => (
      <Art {...p}>
        <path
          d="M32 50V16"
          stroke="#E7F0E4"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M32 24c-8-2-12-8-12-8M32 32c-10-2-14-8-14-8M32 40c-8-2-12-7-12-7M32 24c8-2 12-8 12-8M32 32c10-2 14-8 14-8M32 40c8-2 12-7 12-7"
          stroke="#D4E5D0"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </Art>
    ),
  },
  {
    id: "dusk",
    name: "Dusk",
    bg: "#8B6F7A",
    Artwork: (p) => (
      <Art {...p}>
        <circle cx="28" cy="30" r="14" fill="#F5D0C8" />
        <circle cx="38" cy="30" r="14" fill="#8B6F7A" />
        <circle cx="48" cy="20" r="2.5" fill="#FEF3C7" opacity="0.9" />
        <circle cx="52" cy="28" r="1.8" fill="#FEF3C7" opacity="0.7" />
      </Art>
    ),
  },
  {
    id: "coral",
    name: "Coral",
    bg: "#C98B7B",
    Artwork: (p) => (
      <Art {...p}>
        <path
          d="M32 48V28"
          stroke="#FFE4E0"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M32 34c-8-8-6-16-6-16M32 34c8-8 6-16 6-16M32 40c-10-4-12-12-12-12M32 40c10-4 12-12 12-12"
          stroke="#FFD5CE"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </Art>
    ),
  },
  {
    id: "glacier",
    name: "Glacier",
    bg: "#8AA0AE",
    Artwork: (p) => (
      <Art {...p}>
        <path d="M18 46L32 16l14 30H18z" fill="#E8F1F5" />
        <path d="M26 46L36 28l10 18H26z" fill="#D0E2EB" opacity="0.9" />
      </Art>
    ),
  },
  {
    id: "mesa",
    name: "Mesa",
    bg: "#B08968",
    Artwork: (p) => (
      <Art {...p}>
        <rect x="14" y="34" width="36" height="14" rx="2" fill="#F5E6D3" />
        <rect x="20" y="24" width="24" height="12" rx="2" fill="#E8D4BC" />
        <rect x="26" y="16" width="12" height="10" rx="2" fill="#DCC4A4" />
      </Art>
    ),
  },
];

export const AVATARS = PRESETS;
export const DEFAULT_AVATAR_ID = "aurora";

const byId = new Map(PRESETS.map((a) => [a.id, a]));

export function getAvatar(avatarId: string | null | undefined): AvatarDef {
  return byId.get(avatarId ?? "") ?? byId.get(DEFAULT_AVATAR_ID)!;
}

export function Avatar({
  avatarId,
  size = 40,
  className = "",
  title,
}: {
  avatarId?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  const avatar = getAvatar(avatarId);
  const { Artwork } = avatar;

  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, backgroundColor: avatar.bg }}
      title={title ?? avatar.name}
      role="img"
      aria-label={title ?? avatar.name}
    >
      <Artwork width={size} height={size} className="h-full w-full" />
    </span>
  );
}
