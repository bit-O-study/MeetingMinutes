import { cn } from "@/lib/utils";

/** 공동 편집 커서와 같은 색 세트. 아바타를 보면 누구 커서인지 바로 알아야 한다. */
export const USER_COLOR_VARS = [
  "var(--user-1)",
  "var(--user-2)",
  "var(--user-3)",
  "var(--user-4)",
  "var(--user-5)",
] as const;

/** 같은 사용자는 어디서나 같은 색을 갖도록 id에서 결정론적으로 뽑는다. */
export function userColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return USER_COLOR_VARS[Math.abs(hash) % USER_COLOR_VARS.length];
}

export function Avatar({
  name,
  image,
  seed,
  size = 22,
  className,
}: {
  name?: string | null;
  image?: string | null;
  seed: string;
  size?: number;
  className?: string;
}) {
  const label = (name ?? "?").trim().slice(0, 1) || "?";

  if (image) {
    return (
      <img
        src={image}
        alt={name ?? ""}
        width={size}
        height={size}
        className={cn("flex-none rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-label={name ?? undefined}
      className={cn(
        "flex flex-none items-center justify-center rounded-full font-medium text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: userColor(seed),
      }}
    >
      {label}
    </span>
  );
}

/** 노트를 보고 있는 사람만 표시한다. 멤버 전체가 아니다. */
export function AvatarStack({
  people,
  max = 4,
  size = 22,
}: {
  people: { id: string; name?: string | null; image?: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div className="flex items-center gap-1">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} image={p.image} seed={p.id} size={size} />
      ))}
      {rest > 0 && (
        <span className="rounded bg-surface-2 px-1.5 font-mono text-[10px] text-ink-3">
          +{rest}
        </span>
      )}
    </div>
  );
}
