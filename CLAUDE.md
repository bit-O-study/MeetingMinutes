@AGENTS.md

---

# CLAUDE 담당 범위

위 AGENTS.md의 「CODEX 담당 범위」는 **Codex용 지시다. 무시할 것.**
Claude는 **데이터 계층과 공동 편집**을 맡는다.

## 내 파일

```
src/lib/db/**                             스키마 · DB 클라이언트
src/lib/access.ts                         권한 검사
src/lib/actions/**                        서버 액션
src/lib/templates.ts                      템플릿 정의
src/lib/collab/**                         공동 편집 클라이언트
src/lib/utils.ts                          공용 유틸
src/components/editor/**                  에디터 · 할 일 패널 · 연결 상태
src/components/ui/**                      공용 프리미티브
src/components/shell/**                   셸
src/app/(app)/layout.tsx  error.tsx       셸 · 예외
src/app/(app)/s/[spaceId]/n/[noteId]/**   S-03 노트 편집
src/app/p/[token]/**                      S-09 공유 열람
src/app/login/**  src/app/api/**          인증
server/**                                 공동 편집 서버
drizzle/**                                마이그레이션
```

## 남은 작업

1. **본문 체크박스 ↔ tasks 양방향 동기화** — 가장 중요. `TaskItem`을 확장해
   노드에 `blockId`를 부여하고, Yjs 트랜잭션에서 tasks 레코드와 맞춘다.
2. **할 일 추가·담당자·기한 UI** — `TaskPanel`의 `TODO(CLAUDE)`.
3. **S-06 변경 이력** — `note_revisions` 스냅샷 기록과 되돌리기.
4. **S-07 공유 링크 관리** + **S-09 공유 열람 뷰**(비로그인, 읽기 전용).
5. **노트 헤더 메뉴** — 공유 / 이력 / 상태 변경 / 휴지통.
6. **배포용 WebSocket** — `server/collab.ts`의 프로토콜부를
   `experimental_upgradeWebSocket` 라우트로 이식.

## Codex와 겹치지 않기

- Codex가 「요청 큐」(`docs/work-split.md`)에 적은 스키마·액션 요청을 먼저 처리한다.
  거기가 막히면 Codex 전체가 막힌다.
- 스키마를 바꾸면 `npm run db:generate` 후 마이그레이션을 커밋하고,
  work-split.md의 변경 로그에 한 줄 남긴다.
- Codex 담당 파일은 열어 보기만 하고 수정하지 않는다. 문제가 보이면
  「요청 큐」에 적는다.
