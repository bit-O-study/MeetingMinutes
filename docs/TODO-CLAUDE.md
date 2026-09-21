# CLAUDE 데이터·공동 편집 TODO

기록일: 2026-09-21. 화면 계층 TODO는 `TODO.md`(Codex)에 따로 있다.
담당 경계는 `work-split.md` §2를 따른다.

## 구현 완료

- [x] 스키마·권한·서버 액션 전량 (`lib/db` · `lib/access` · `lib/actions/**`)
- [x] 본문 체크박스 ↔ `tasks` 양방향 동기화 (`blockId`가 연결 고리)
- [x] 할 일 추가·담당자·기한 지정 UI (`TaskPanel`)
- [x] S-06 변경 이력 — 스냅샷 기록·미리보기·되돌리기
- [x] S-07 공유 링크 관리 · S-09 비로그인 읽기 전용 열람
- [x] 노트 헤더 메뉴 (공유 / 이력 / 상태 변경 / 휴지통)
- [x] Codex 요청 큐 9건 전량 처리
- [x] 배포용 WebSocket — 프로토콜을 `lib/collab/room.ts`로 분리하고
      `app/api/collab/[noteId]`에서 `experimental_upgradeWebSocket`으로 받는다

## 남은 작업

### 1. 운영 배포 (가장 앞선다)

- [ ] **구글 OAuth 연결** — `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET`을 채우고
      리디렉션 URI에 운영 도메인을 등록한다. 지금은 개발 전용 로그인으로만 들어간다.
- [ ] **개발 전용 로그인 제거** — `lib/actions/dev-auth.ts`와 `/login`의 이름 입력부.
      `NODE_ENV=development`에서만 렌더되므로 급하지는 않지만, 운영 전에 통째로 지운다.
- [ ] **Vercel 프로젝트 설정** — 환경변수 이관, Fluid Compute 확인(WebSocket의 전제),
      `NEXT_PUBLIC_APP_URL`을 운영 도메인으로. 배포에는 `npm run collab`이 필요 없다.
- [ ] **배포 후 공동 편집 실측** — `experimental_upgradeWebSocket`은 Vercel 런타임
      브리지가 있어야 동작한다. 로컬 `next dev`에서는 검증할 수 없어서 타입·빌드와
      `room.ts` 동작(개발 서버 경유)까지만 확인했다. 두 창으로 같은 노트를 열어
      커서·동기화·재연결을 반드시 눈으로 본다.

### 2. 공동 편집의 알려진 한계

- [ ] **인스턴스가 갈리면 실시간 전파가 끊긴다.** 방 상태가 인스턴스 메모리에 있어서다
      (`lib/collab/room.ts` 첫 주석). 동시 접속이 한 자릿수인 스터디 규모에서는 한
      인스턴스에 모이므로 지금은 그대로 둔다. 같은 노트에 사람이 늘어 어긋남이 보이면
      그때 방 상태를 Redis pub/sub으로 옮긴다. **증상이 보이기 전에 옮기지 말 것** —
      저장소를 하나 더 두는 비용이 지금의 이득보다 크다.
- [ ] **연결은 함수 최대 실행 시간에 끊긴다.** y-websocket이 지수 백오프로 다시 붙고
      그동안의 입력은 로컬 Yjs 문서에 남는다. 재연결 뒤 이력 작성자가 "미상"으로
      찍히는 경우가 실제로 잦은지 배포 후에 본다(`resolveActor` 주석 참고).

### 3. 코드 정리

- [ ] `useCollab.ts:94` — `react-hooks/set-state-in-effect` 오류. `npm run lint`가
      이것 하나로 실패한다. provider를 state 대신 ref나 `useSyncExternalStore`로
      옮겨야 하는데, 에디터 마운트 시점과 얽혀 있어 따로 손본다.
- [ ] `Avatar.tsx:36` — `<img>` 경고. 아바타는 구글 프로필 URL이라 `next/image`로
      바꾸면 도메인 허용 설정이 따라온다. 경고로 두고 있다.

### 4. 2차 이후 (설계 v2에 예정된 범위)

- [ ] 우측 패널의 **댓글**(2차) · **전사**(3차). 노트 편집의 2분할 레이아웃은
      이걸 받으려고 유지하는 것이다 — 설계 원칙 8.

## 검증 메모

- `npm run typecheck` · `npm run build` · `npm run test`(30건) 통과.
- 공동 편집 리팩터링은 개발 서버를 띄우고 클라이언트 두 개를 붙여 확인했다.
  문서 동기화와, **소켓이 인사 없이 끊겼을 때 남의 커서가 사라지는 것**까지 봤다.
  (끊긴 연결이 쥔 awareness clientId만 지우도록 이번에 고친 부분이다.)
