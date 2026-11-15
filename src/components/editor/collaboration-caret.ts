import { resolveCaretColor } from "@/lib/collab/caret-color";

/** 상단 참여자와 같은 한 글자 표시를 실제 편집 커서에 붙인다. */
export function renderCollaborationCaret(user: { name?: unknown; color?: unknown }): HTMLElement {
  const name = typeof user.name === "string" ? user.name.trim() : "";
  const color = resolveCaretColor(typeof user.color === "string" ? user.color : "");
  const caret = document.createElement("span");
  caret.className = "collaboration-carets__caret";
  caret.style.borderColor = color;

  const avatar = document.createElement("span");
  avatar.className = "collaboration-carets__label collaboration-carets__avatar";
  avatar.style.backgroundColor = color;
  avatar.textContent = name.slice(0, 1) || "?";
  avatar.title = name || "참여자";
  avatar.setAttribute("aria-label", `${name || "참여자"} 편집 위치`);
  caret.appendChild(avatar);
  return caret;
}
