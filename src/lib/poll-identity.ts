import { createHash } from "node:crypto";

/**
 * 링크로 참여한 사람이 자기 응답을 알아보는 방법. 서버 전용(node:crypto)이지만 next/headers 를 쓰지 않아
 * 검증 스크립트에서도 불러올 수 있다.
 */

/** 본인 응답을 알아보는 쿠키. 투표마다 따로 두고, 값은 무작위 토큰(DB 에는 해시만 있다). */
export function pollCookieName(pollId: string): string {
  return `pv_${pollId}`;
}

export function hashEditToken(token: string): string {
  return createHash("sha256").update(`poll-edit:${token}`, "utf8").digest("hex");
}
