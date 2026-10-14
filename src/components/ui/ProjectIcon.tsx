import { cn } from "@/lib/utils";
import { PROJECT_BG_CLASS, projectColor, projectInitial } from "@/components/ui/projectColor";

/** 프로젝트 아이콘 — 프로젝트 색 둥근 네모 + 이름 첫 글자. 글자를 읽기 전에 색으로 알아보게. */
export function ProjectIcon({
  spaceId,
  name,
  size = "md",
  className,
}: {
  spaceId: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const color = projectColor(spaceId);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center font-black text-white",
        PROJECT_BG_CLASS[color],
        size === "sm" && "size-6 rounded-lg text-[11px]",
        size === "md" && "size-9 rounded-xl text-[15px]",
        size === "lg" && "size-12 rounded-2xl text-xl",
        className,
      )}
    >
      {projectInitial(name)}
    </span>
  );
}
