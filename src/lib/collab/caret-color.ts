/** 테마 토큰을 Tiptap이 허용하는 6자리 색으로 변환한다. */
export function resolveCaretColor(value: string): string {
  const token = /^var\((--user-[1-5])\)$/.exec(value);
  const resolved = token && typeof document !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(token[1]).trim()
    : value;
  return /^#[\da-f]{6}$/i.test(resolved) ? resolved : "#3b5bdb";
}
