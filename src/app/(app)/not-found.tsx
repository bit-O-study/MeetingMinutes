import { AccessDenied } from "@/components/ui/Panels";

/**
 * 권한 없는 접근과 존재하지 않는 노트가 모두 여기로 온다.
 * `@/lib/access`의 검사 실패가 notFound()를 호출하기 때문이다.
 *
 * 노트 제목·스페이스명을 절대 표시하지 않는다 — 존재 여부 자체가 정보다.
 */
export default function AppNotFound() {
  return <AccessDenied />;
}
