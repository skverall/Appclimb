export const AVATAR_KEYS = [
  "ridge",
  "river",
  "summit",
  "forest",
  "dawn",
  "glacier",
  "night",
  "horizon",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

const palettes: Record<
  AvatarKey,
  { sky: string; back: string; front: string; river: string; sun?: string }
> = {
  ridge: {
    sky: "#e5f3ef",
    back: "#73aaa2",
    front: "#17484b",
    river: "#8ed0c3",
  },
  river: {
    sky: "#dff1ef",
    back: "#8dbdb6",
    front: "#2a6262",
    river: "#f7fbfa",
  },
  summit: {
    sky: "#edf6f3",
    back: "#a8cfc7",
    front: "#346e6b",
    river: "#6db6ad",
  },
  forest: {
    sky: "#e7efdf",
    back: "#8daa7c",
    front: "#234e47",
    river: "#cde5cc",
    sun: "#fff7d8",
  },
  dawn: {
    sky: "#f3eadb",
    back: "#d39a78",
    front: "#1d5a58",
    river: "#f4c8a7",
    sun: "#fff7df",
  },
  glacier: {
    sky: "#e6f5f5",
    back: "#9acfd0",
    front: "#3d7777",
    river: "#f8ffff",
  },
  night: {
    sky: "#173f46",
    back: "#467b79",
    front: "#0f292f",
    river: "#87c6bd",
    sun: "#dff4e8",
  },
  horizon: {
    sky: "#e9f4ef",
    back: "#a6c8b9",
    front: "#416f66",
    river: "#d7eee7",
    sun: "#fff9d6",
  },
};

export function ProfileAvatar({
  avatarKey,
  className,
}: {
  avatarKey: AvatarKey;
  className?: string;
}) {
  const palette = palettes[avatarKey];
  return (
    <span
      className={className ? `profile-art ${className}` : "profile-art"}
      data-avatar={avatarKey}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" role="img">
        <rect width="64" height="64" rx="32" fill={palette.sky} />
        {palette.sun && (
          <circle cx="46" cy="17" r="7" fill={palette.sun} opacity="0.92" />
        )}
        <path
          d="M-4 48 17 20l11 16 8-11 28 29v14H-4Z"
          fill={palette.back}
        />
        <path
          d="M-7 55 15 31l9 13 10-19 34 35v10H-7Z"
          fill={palette.front}
        />
        <path
          d="M21 64c6-12 22-12 24-22-8 3-18 4-27 2 8 5 14 7 3 20Z"
          fill={palette.river}
          opacity="0.96"
        />
      </svg>
    </span>
  );
}
