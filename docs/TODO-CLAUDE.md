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
- [x] 그 라우트가 업그레이드 직후 끝나 버리던 것. `joinRoom`이 소켓이 닫힐 때까지
      끝나지 않는 약속을 돌려주고 라우트가 그걸 기다린다. 핸들러가 먼저 끝나면
      런타임이 호출을 정리하면서 방금 붙은 소켓까지 끊는다 —
      **배포에서만** 나는 증상이라 로컬에서는 보이지 않았다.

## 남은 작업

### 0. DB 연결 상한 — 배포 전에 결론을 내야 한다

풀러(Supavisor)가 **세션 모드**라서 클라이언트 하나가 서버 연결 하나를 통째로 쥔다.
이 프로젝트의 상한은 15고, 넘으면 접속이 거절된다.

```
XX000 (EMAXCONNSESSION) max clients reached in session mode
  - max clients are limited to pool_size: 15
```

로컬에서 `next start` 하나와 개발 서버 하나를 같이 띄운 것만으로 재현됐다.
인스턴스당 `max: 10`이었던 것을 3으로 낮추고 `idle_timeout`을 넣어 급한 불은 껐다
(`DATABASE_POOL_MAX`로 조절한다). 세션 모드에서는 **노는 연결도 슬롯을 차지**해서
돌려주지 않으면 그대로 쌓인다.

- [ ] 그래도 배포에서는 인스턴스가 여럿이고 **공동 편집 라우트는 연결이 오래 산다.**
      3 × 5 인스턴스면 바닥이다. 제대로 된 해법은 풀러를 **트랜잭션 모드(:6543)**로
      옮기는 것이다 — 서버 연결을 여러 클라이언트가 나눠 쓴다. `prepare: false`는
      이미 그쪽 전제라 코드는 그대로고, `DATABASE_URL`의 포트만 바꾸면 된다.
      바꾼 뒤 `npm run check:revisions`와 `scripts/verify-password-auth.mts`를 다시 돌린다.

### 0-1. 비밀번호 로그인 — 읽고 확인한 것

Codex가 구현했고(`src/lib/password-auth.ts` · `src/lib/actions/password-auth.ts`),
내 담당 영역이라 읽었다. 해시·세션 고정 방지·기존 계정 탈취 방지·동시 가입 직렬화는
제대로 돼 있다. 손본 것과 남은 것은 이렇다.

- [x] **시도 제한이 성공까지 세고 있었다.** 로그인에 성공해도 누적이 남아,
      공동 편집을 확인하느라 두 계정을 번갈아 들어가는 것만으로 15분 잠겼다.
      성공하면 그 이메일의 누적을 지운다(`clearAuthAttempts`). 주소 버킷은 그대로 둔다.
- [ ] **남의 이메일로 10번 틀리면 15분 잠근다.** 계정 잠금 DoS는 이메일 단위 제한에
      딸려 오는 것이라 없앨 수 없다. 스터디 규모에서는 감수한다. 문제가 보이면
      실패한 주소를 같이 보고 판단하는 쪽으로 옮긴다.
- [ ] **Vercel이 아니면 주소 버킷이 하나다.** `address`가 `"local"` 고정이라
      15분에 60번을 전원이 나눠 쓴다. Vercel 배포면 상관없지만 옮기면 걸린다.
- [ ] **쿠키 이름을 `NODE_ENV`로 정한다**(`src/lib/session-cookie.ts`).
      운영 빌드는 `__Secure-` 접두사와 `secure: true`를 쓴다. localhost는 보안
      컨텍스트라 http여도 되지만, **휴대폰에서 `http://192.168.x.x`로 여는 확인은
      쿠키가 저장되지 않아 로그인이 안 된다.** 그때는 프로토콜 기준으로 바꿔야 한다.

로컬에서 운영 빌드를 검증하는 방법(배포에는 필요 없다 — Vercel은 `VERCEL`을 보고
호스트를 자동으로 신뢰한다):

```
npm run build
AUTH_TRUST_HOST=true npx next start -p 3100     # 없으면 UntrustedHost로 막힌다
npx tsx scripts/verify-password-auth.mts
```

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

- [x] `useCollab.ts` — `set-state-in-effect` 오류. 연결을 React 바깥의 모듈
      레지스트리로 옮기고 `useSyncExternalStore`로 구독한다. 곁다리로 두 가지가
      같이 풀렸다. 에디터가 **첫 마운트에** provider를 받으므로 커서 확장 없이
      만들어졌다 버려지는 일이 없고, 남의 커서가 움직일 때마다 워크스페이스가
      다시 그려지던 것도 멈춘다(awareness 변화를 아바타에 보이는 값으로 거른다).
- [x] `npm run test`가 아예 돌지 않던 것. `tsx --test "src/**/*.test.mts"`의 글롭을
      펼치는 주체가 없었다 — node 테스트 러너의 글롭은 22부터고(여기는 20),
      npm 스크립트는 Windows에서 cmd.exe로 돈다. `scripts/run-tests.mts`가 찾아서 돌린다.
- [x] Next 바깥 도구들이 `.env`를 못 읽던 것. `scripts/load-env.mjs`로 통일했다.
- [ ] `Avatar.tsx:36` — `<img>` 경고. 아바타는 구글 프로필 URL이라 `next/image`로
      바꾸면 도메인 허용 설정이 따라온다. 구글 OAuth를 붙일 때 같이 본다.

### 4. 2차 이후 (설계 v2에 예정된 범위)

- [ ] 우측 패널의 **댓글**(2차) · **전사**(3차). 노트 편집의 2분할 레이아웃은
      이걸 받으려고 유지하는 것이다 — 설계 원칙 8.

## 검증 메모

- `npm run typecheck` · `npm run lint` · `npm run build` · `npm run test` 통과.
- `npm run check:revisions` 통과 — 헤드리스 클라이언트가 붙어 편집하고 끊기까지,
  `joinRoom` 수정 뒤에도 접속·동기화·종료 처리가 그대로다.
- **`useCollab` 교체와 `joinRoom` 수정은 브라우저 두 창으로 아직 못 봤다.**
  로그인 화면이 비밀번호 로그인으로 바뀌는 중이라 그게 끝난 뒤에 한다.
  `joinRoom` 쪽은 어차피 배포에서만 증상이 나므로 배포 후 실측이 진짜 확인이다.
- 공동 편집 리팩터링은 개발 서버를 띄우고 클라이언트 두 개를 붙여 확인했다.
  문서 동기화와, **소켓이 인사 없이 끊겼을 때 남의 커서가 사라지는 것**까지 봤다.
  (끊긴 연결이 쥔 awareness clientId만 지우도록 이번에 고친 부분이다.)
