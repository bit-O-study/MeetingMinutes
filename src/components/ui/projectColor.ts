/**
 * 프로젝트(스페이스) 색 — 재디자인(2026-10-14).
 *
 * 아직 DB 에 색 칸이 없어서 스페이스 id 로 8가지 중 하나를 정한다(같은 프로젝트는 어디서나 같은 색).
 * 나중에 사용자가 고르게 되면(spaces.color) 그 값을 먼저 쓰고, 없을 때만 이 계산으로 떨어진다.
 * Tailwind 는 클래스 이름을 글자 그대로 찾아야 하므로 클래스를 표로 적어 둔다(조합해서 만들지 말 것).
 */
export const PROJECT_COLORS = ["blue", "teal", "orange", "violet", "green", "pink", "yellow", "slate"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** 프로젝트 안 화면을 감싸면 강조색(accent)이 그 색으로 바뀐다 — globals.css 의 .project-*. */
export const PROJECT_SCOPE_CLASS: Record<ProjectColor, string> = {
  blue: "project-blue",
  teal: "project-teal",
  orange: "project-orange",
  violet: "project-violet",
  green: "project-green",
  pink: "project-pink",
  yellow: "project-yellow",
  slate: "project-slate",
};

/** 진한 면(아이콘 바탕·머리글). */
export const PROJECT_BG_CLASS: Record<ProjectColor, string> = {
  blue: "bg-p-blue",
  teal: "bg-p-teal",
  orange: "bg-p-orange",
  violet: "bg-p-violet",
  green: "bg-p-green",
  pink: "bg-p-pink",
  yellow: "bg-p-yellow",
  slate: "bg-p-slate",
};

export function projectColor(spaceId: string, chosen?: string | null): ProjectColor {
  if (chosen && (PROJECT_COLORS as readonly string[]).includes(chosen)) return chosen as ProjectColor;
  let hash = 0;
  for (let i = 0; i < spaceId.length; i++) hash = (hash * 31 + spaceId.charCodeAt(i)) | 0;
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

/** 아이콘 글자 — 이름의 첫 글자(공백·기호 건너뜀). */
export function projectInitial(name: string): string {
  const ch = [...name.trim()].find((c) => /[\p{L}\p{N}]/u.test(c));
  return ch ? ch.toUpperCase() : "·";
}
