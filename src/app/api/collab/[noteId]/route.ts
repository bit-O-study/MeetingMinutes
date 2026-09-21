/**
 * 배포용 공동 편집 엔드포인트.
 *
 *   wss://<호스트>/api/collab/<noteId>
 *
 * y-websocket 클라이언트는 `서버주소 + "/" + 방이름`으로 붙는다. 그래서
 * `NEXT_PUBLIC_COLLAB_URL`이 `/api/collab`이면 여기로 들어온다(useCollab 참고).
 *
 * WebSocket은 Upgrade 헤더가 붙은 평범한 GET이라 미들웨어·방화벽·쿠키가
 * 그대로 통한다. 덕분에 개발용 :1234 서버와 달리 **권한 검사를 할 수 있다** —
 * 접속 시점에 requireNoteAccess를 통과하지 못하면 업그레이드 자체가 안 된다.
 *
 * 연결은 함수 최대 실행 시간에서 끊긴다. 끊기면 y-websocket이 알아서
 * 지수 백오프로 다시 붙고, 그동안의 입력은 로컬 Yjs 문서에 남아 있다가
 * 재연결 때 합쳐진다. 저장 버튼이 없어도 되는 이유가 이것이다.
 */
import { experimental_upgradeWebSocket } from "@vercel/functions";

import { requireNoteAccess } from "@/lib/access";
import { joinRoom } from "@/lib/collab/room";
import { UnauthenticatedError } from "@/lib/auth";

/**
 * Pro 이상에서만 800초까지 늘어난다(Hobby는 300초 고정).
 * 더 길게 잡는 것보다 재연결이 매끄러운 편이 안전하다.
 */
export const maxDuration = 800;

export async function GET(_request: Request, { params }: RouteContext<"/api/collab/[noteId]">) {
  const { noteId } = await params;

  try {
    // 권한은 반드시 access를 경유한다. 없으면 notFound()가 404로 착지한다.
    await requireNoteAccess(noteId);
  } catch (err) {
    if (err instanceof UnauthenticatedError) return new Response(null, { status: 401 });
    throw err;
  }

  return experimental_upgradeWebSocket((ws) => {
    joinRoom(noteId, ws);
  });
}
