# 에이전트 분담

Claude Code와 Codex가 같은 저장소에서 동시에 작업하기 위한 규칙.

작성일: 2026-09-21

---

## 1. 왜 이렇게 나누는가

두 에이전트가 같은 파일을 건드리면 서로의 변경을 덮어쓴다. 브랜치를 나누면 충돌은 피하지만
매번 병합해야 하고, 한쪽이 스키마를 바꾸면 다른 쪽이 통째로 깨진다.

그래서 **계층으로 나눈다.**

| | 담당 | 이유 |
| --- | --- | --- |
| **Claude** | 데이터 계층 + 공동 편집 | 스키마·권한·Yjs는 한 사람 머릿속에 있어야 일관된다. 공동 편집은 이 프로젝트의 유일한 난제다 |
| **Codex** | 화면 계층 | 목록·필터·빈 상태는 서로 독립적이라 병렬로 만들기 좋다 |

경계는 **서버 액션**이다. Claude가 액션을 제공하고, Codex는 호출만 한다.

---

## 2. 파일 소유권

한 파일에는 주인이 하나다. 주인이 아니면 읽기만 한다.

### Claude 소유

```
src/lib/db/**                             스키마 · DB 클라이언트
src/lib/access.ts                         권한 검사
src/lib/actions/**                        서버 액션
src/lib/templates.ts                      템플릿 정의
src/lib/collab/**                         공동 편집 클라이언트
src/lib/utils.ts                          공용 유틸
src/components/editor/**                  에디터 · 할 일 패널 · 연결 상태
src/components/ui/**                      공용 프리미티브 (Avatar · Badge · Panels)
src/components/shell/**                   셸 (Sidebar · TopBar)
src/app/(app)/layout.tsx                  셸 조립
src/app/(app)/error.tsx                   접근 거부 · 예외
src/app/(app)/s/[spaceId]/n/[noteId]/**   S-03 노트 편집
src/app/p/[token]/**                      S-09 공유 열람 뷰
src/app/login/**                          로그인
src/app/api/**                            인증 · API
server/**                                 공동 편집 서버
drizzle/**                                마이그레이션
```

### Codex 소유

```
src/app/(app)/page.tsx                    S-01 홈
src/app/(app)/s/[spaceId]/page.tsx        S-02 스페이스
src/app/(app)/s/[spaceId]/new/**          S-02a 템플릿 선택
src/app/(app)/spaces/new/**               스페이스 생성
src/app/(app)/tasks/page.tsx              S-04 내 할 일
src/app/(app)/search/page.tsx             S-05 검색
src/app/join/[token]/**                   S-08 초대 링크 참여
src/components/screens/**                 위 화면 전용 컴포넌트
```

### 공유 (둘 다 수정 가능, 추가만)

```
docs/work-split.md    이 문서의 「요청 큐」와 「변경 로그」 절만
```

`package.json`, `AGENTS.md`, `CLAUDE.md`, `globals.css`는 **Claude만** 수정한다.
Codex가 새 패키지가 필요하면 요청 큐에 적는다.

---

## 3. 이미 제공된 것

Codex가 바로 쓸 수 있는 것들. 시그니처는 파일에서 확인할 것.

### 권한 — `@/lib/access`

```ts
requireSpaceMember(spaceId)   // → { userId, space, role }
requireSpaceOwner(spaceId)    // 초대·삭제 등 소유자 전용
requireNoteAccess(noteId)     // → { userId, space, role, note }
listMySpaces()                // → { space, role }[]
mySpaceIds()                  // → string[]  검색 범위 필터용
```

실패하면 `NotAccessibleError`를 던진다. `src/app/(app)/error.tsx`가 받아서
접근 거부 화면을 보여 준다. **try/catch로 감싸지 말 것.**

### 서버 액션 — `@/lib/actions/*`

```ts
// notes.ts
createNote({ spaceId, template, title? })   // 생성 후 노트로 redirect
suggestNoteTitle(spaceId, template)         // → { title, sessionNo }
renameNote(noteId, title)
setNoteStatus(noteId, "draft" | "tidied")
trashNote(noteId)

// tasks.ts
toggleTask(taskId)                          // 완료 ↔ 되돌리기
createTask({ noteId, body, assigneeId?, dueDate?, blockId? })
updateTask(taskId, { body?, assigneeId?, dueDate? })  // → 갱신된 노트 할 일 목록
deleteTask(taskId)                          // → 갱신된 노트 할 일 목록
listNoteTasks(noteId)

// spaces.ts
createSpace({ name, kind })                 // 생성 후 스페이스로 redirect
renameSpace(spaceId, name)                  // 소유자만
deleteSpace(spaceId)                        // 소유자만. 표시만 하고 실제로는 안 지운다
listSpaceMembers(spaceId)                   // → { id, name, image, role, joinedAt }[]
removeMember(spaceId, userId)               // 소유자만
transferOwnership(spaceId, toUserId)        // 소유자만
leaveSpace(spaceId)                         // 소유자는 넘긴 뒤에만
listInviteLinks(spaceId)                    // → + url, active
createInviteLink(spaceId, { expiresInDays? })
revokeInviteLink(inviteId)
reissueInviteLink(inviteId, expiresInDays?) // 회수 + 새로 발급
peekInvite(token)                           // 로그인 전 미리보기. 없거나 만료면 null
joinByInviteToken(token)                    // 참여 후 스페이스로 redirect
countSpaceNotes(spaceId)

// search.ts
searchNotes(query, { spaceIds?, from?, to?, status?, limit? })
  // → { total, hits: { id, title, spaceId, spaceName, status, updatedAt, snippet, section }[] }
  // total은 limit 적용 전 전체 건수 — "N건" 표시에 쓴다
  // section = 일치한 구획 제목. "막힌 것 · 질문"에서 나온 결과가 가장 쓸모 있다
openQuestionCounts(spaceId)                 // → { [noteId]: 미해결 질문 수 }

// shares.ts  (S-07)
listShareLinks(noteId)                      // → { id, url, expiresAt, revokedAt, viewCount, active }[]
createShareLink(noteId, { expiresInDays? }) // 만료 기본값 없음. 회수는 언제든 된다
revokeShareLink(shareId)                    // → 갱신된 목록

// revisions.ts
listRevisions(noteId)
getRevisionContent(noteId, revisionId)
restoreRevision(noteId, revisionId)
```

**초대·삭제처럼 소유자 전용 동작은 실패 시 404로 착지한다.** 버튼을 보여 줄지 말지는
`requireSpaceMember`가 돌려주는 `role`로 판단한다.

### UI 프리미티브 — `@/components/ui/*`

```ts
Card · CardTitle · SectionHeading · EmptyState · AccessDenied   // Panels
Badge · NoteStatusBadge · DueBadge                              // Badge
Avatar · AvatarStack · userColor                                // Avatar
```

### 유틸 — `@/lib/utils`

```ts
cn(...)                        // 클래스 병합
todayInSeoul()                 // "YYYY-MM-DD"
isOverdue(dueDate, doneAt)     // 지연 계산
relativeTime(date)             // "2시간 전"
linkToken()                    // 초대·공유 토큰
absoluteUrl(path)              // 링크의 절대 URL
```

### 템플릿 — `@/lib/templates`

```ts
TEMPLATES · TEMPLATE_ORDER · defaultTemplateFor(spaceKind) · buildTemplateDoc(kind, n)
```

---

## 4. 요청 큐

Codex가 필요한데 없는 것을 여기 적는다. Claude가 구현하고 체크한다.
**직접 만들지 말 것** — 스키마와 액션이 갈라지면 분담 자체가 무의미해진다.

| | 요청 | 요청자 | 상태 |
| --- | --- | --- | --- |
| 1 | `createSpace({ name, kind })` 액션 | — | ✅ 완료 |
| 2 | 초대 링크 발급·재발급·회수·만료 · 참여 (`joinByInviteToken`) | — | ✅ 완료 |
| 3 | `listSpaceMembers(spaceId)` — id/name/image/role | — | ✅ 완료 |
| 4 | 노트별 **미해결 질문 수** 집계 (S-02 배지용) | — | ✅ 완료 |
| 5 | `searchNotes(query, { spaceIds, from, to, status })` | — | ✅ 완료 |
| 6 | 스페이스 이름 변경·삭제, 멤버 제외·소유권 이전 | Codex | ✅ 완료 |
| 7 | `scripts/check-revisions.mts`의 타입 오류 | Codex | ✅ 이미 수정됨. typecheck 통과 확인 |
| 8 | `searchNotes`에 `total`(전체 건수) 필요 | Codex | ✅ 완료. 반환이 `{ total, hits }`로 바뀜 |
| 9 | 검색 날짜 경계가 DB 세션 시간대에 의존 | Codex | ✅ 완료. 실제 버그였음 — AT TIME ZONE으로 서울 자정 명시 |

| 10 | Hobby 배포 설정 수정 / `src/app/api/collab/[noteId]/route.ts:27`의 `maxDuration = 800`을 300으로 낮추고 관련 주석 정리 / Vercel Hobby의 Fluid Compute 최대 실행 시간은 300초이므로 현재 설정이 한도를 초과한다. 제공된 로그에서는 컴파일·타입 검사가 통과했지만 실제 배포 오류 문구가 누락되어 이번 실패 원인으로는 아직 미확정. 근거: https://vercel.com/docs/functions/configuring-functions/duration | Codex | 사용자 직접 수정 지시에 따라 300초로 수정. typecheck·build 통과. Vercel 재배포 확인 필요 |

1차 화면은 전부 구현됐다. 배포 설정 요청은 위 큐에서 추적한다.

새 요청은 아래에 행을 추가한다. 형식: `필요한 것 / 어느 화면에서 / 왜`.

---

## 5. 변경 로그

스키마·액션 시그니처가 바뀌면 여기 한 줄 남긴다. 상대가 깨진 이유를 알아야 한다.

| 날짜 | 변경 | 영향 |
| --- | --- | --- |
| 2026-09-26 | 초대 생성 후 HTTP 500 재현: DB 저장은 됐지만 절대 URL 구성·목록 표시 실패. `absoluteUrl`에서 빈 값·공백·잘못된 앱 주소를 처리하고 Vercel 운영/배포 도메인으로 대체 | 초대·공유 링크 공통 적용. 권한·기존 토큰 보존. 회귀 테스트 및 `scripts/verify-invite-links.mts` 추가 |
| 2026-09-21 | 사용자 요청으로 Codex가 이메일·비밀번호 자체 로그인 구현. Google 로그인 UI·프로바이더 제거, `password_credentials`·`auth_attempts` 및 마이그레이션 `0003` 추가 | `passwordSignIn`·`passwordSignUp` 서버 액션, 기존 Auth.js DB 세션·권한 유지. 기존 계정에 이메일만으로 비밀번호를 설정할 수 없음. 이메일 인증·비밀번호 재설정은 미제공 |
| 2026-09-21 | 최초 스캐폴딩. 스키마·권한·액션·셸·에디터 골격 | — |
| 2026-09-21 | Supabase 연결. 마이그레이션 `0000` 적용, 12개 테이블 생성 | `npm run db:migrate`로 최신 상태 유지 |
| 2026-09-21 | 본문 체크박스 ↔ `tasks` 동기화. `syncNoteTasks` · `toggleTaskInNote` 추가 | 할 일의 존재·문구는 이제 본문이 정한다 |
| 2026-09-21 | `note_revisions.state`(bytea) → `content`(jsonb). 마이그레이션 `0001`·`0002` | 이력 조회·되돌리기 액션 추가 (`lib/actions/revisions.ts`) |
| 2026-09-21 | 공유 링크 액션(`lib/actions/shares.ts`)과 공개 열람 페이지 `/p/[token]` | 스키마 변경 없음. `share_links`는 처음부터 있었다 |
| 2026-09-21 | 공동 편집 프로토콜을 `lib/collab/room.ts`로 분리. 배포 경로 `app/api/collab/[noteId]` 추가 | 스키마·액션 변경 없음. `server/collab.ts`는 개발용 껍데기로 남고, 배포는 Next 라우트가 받는다 |
| 2026-09-21 | `useCollab`을 `useSyncExternalStore` + 모듈 레지스트리로 교체 | 반환값(`doc` · `provider` · `status` · `syncedAt` · `peers`)은 그대로. 에디터가 첫 마운트에 provider를 받는다 |
| 2026-09-21 | 환경변수 로딩을 `scripts/load-env.mjs`로 통일. `npm run test` · `dev:session` 스크립트 정리 | `npm run collab`·`check:revisions`에서 `--env-file` 제거. 명령 사용법만 바뀐다 |
| 2026-09-21 | `joinRoom`이 소켓이 닫힐 때까지 끝나지 않는 약속을 돌려준다 | 반환 타입이 `void` → `Promise<void>`. 호출부는 기다리거나 `void`로 버린다 |
| 2026-09-21 | DB 풀 상한 `max: 10` → 3(`DATABASE_POOL_MAX`) · `idle_timeout` 추가 | 풀러 세션 모드 상한이 15다. 넘기면 XX000으로 접속이 거절된다 |
| 2026-09-21 | 로그인 시도 제한이 성공한 로그인도 세던 것 수정(`clearAuthAttempts`) | 제한이 "시도"가 아니라 "실패" 기준이 된다. 시그니처 변경 없음 |
| 2026-09-21 | 개발 전용 로그인(`lib/actions/dev-auth.ts`) 삭제 | 비밀번호 로그인으로 대체됐다. `npm run dev:session`은 그대로 쓴다 |

### DB 접속 메모

Supabase 프로젝트 `rptkldwjfrqhuaraahcn`, 리전 **ap-southeast-1**, PostgreSQL 17.6.

이 프로젝트에는 `db.{ref}.supabase.co` 직접 연결 호스트가 없다. **풀러(Supavisor) 전용**이다.

```
aws-0-ap-southeast-1.pooler.supabase.com:5432    세션 모드
사용자: postgres.rptkldwjfrqhuaraahcn
```

풀러를 거치므로 **prepared statement를 쓰지 않는다** (`prepare: false`). SSL 필수.
스키마를 바꾸면 `npm run db:generate` → `npm run db:migrate` 순으로 적용하고
생성된 `drizzle/*.sql`을 커밋한다.

#### 환경변수는 `.env.local`과 `.env`를 둘 다 읽는다

Next의 규칙과 같다 — 같은 키가 양쪽에 있으면 `.env.local`이 이긴다.
Next 바깥에서 도는 것들(`npm run collab`, `drizzle-kit`, `scripts/*.mts`)은
node의 `--env-file` 대신 `scripts/load-env.mjs`를 첫 줄에 import 해서 맞춘다.
`--env-file`은 파일을 하나만 받아서, `DATABASE_URL`이 `.env`에 있으면
**앱은 멀쩡한데 도구만 연결 문자열을 못 찾는** 상태가 된다.

---

## 6. 동시 작업 절차

1. **작업 전** `git pull` 후 `npm run typecheck`로 현재 상태를 확인한다.
2. 자기 소유 파일만 수정한다.
3. **커밋 전** `npm run typecheck && npm run build`가 통과해야 한다.
4. 커밋 메시지 앞에 담당을 붙인다 — `[codex] S-01 홈 할 일 블록`, `[claude] 체크박스 동기화`.
5. 상대 파일에서 문제를 발견하면 고치지 말고 요청 큐에 적는다.

### 막혔을 때

- **Codex가 막힘** — 요청 큐에 적고, 그 화면은 `TODO(CODEX)`로 남긴 뒤 다음 화면으로 간다.
- **Claude가 막힘** — 스키마 변경이 필요하면 먼저 요청 큐를 비우고, 변경 로그를 남긴 뒤 진행한다.

---

## 7. 지금 상태

```
✓ 스키마 (users · spaces · notes · tasks · revisions · shareLinks · invites)
✓ 권한 (requireSpaceMember / requireNoteAccess / mySpaceIds)
✓ 서버 액션 (notes · tasks)
✓ 템플릿 3종 (스터디 · 인수인계 · 빈 노트)
✓ 디자인 토큰 + 폰트 (light/dark)
✓ 셸 (TopBar · Sidebar)
✓ 에디터 골격 (Tiptap + Yjs + 커서 + 연결 상태)
✓ 공동 편집 서버 (Postgres 스냅샷)
✓ 로그인 (Google)
✓ npm run build 통과 · 8개 라우트

✓ DB 연결 (Supabase · 12개 테이블 생성 완료)
✓ 개발 전용 로그인 (구글 OAuth 없이 이름만으로 진입)
✓ 개발용 공유 스페이스 자동 준비 (샘플 노트 2건)
✓ 접근 제어 검증 (다른 사람 노트 → 404, 제목·스페이스명 유출 없음)

✓ 본문 체크박스 ↔ tasks 양방향 동기화
✓ S-06 변경 이력 (기록·미리보기·되돌리기)
✓ 요청 큐 전량 처리 (스페이스·초대·멤버·검색·질문 집계)
✓ S-01 홈 · S-02 스페이스 · S-04 내 할 일 (Codex)

☐ S-02 멤버 탭·초대 UI · S-02a 템플릿 선택 · S-05 검색 (Codex)
✓ S-07 공유 링크 · S-09 공유 열람 (비로그인 읽기 전용)

✓ S-08 초대 참여 화면 (Codex)
✓ 배포용 WebSocket (`/api/collab/[noteId]` · experimental_upgradeWebSocket)

☐ 구글 OAuth (운영 배포 전에 필요. 개발은 위 임시 로그인으로 진행)
☐ 배포 후 공동 편집 실측 (로컬에서는 업그레이드 라우트를 띄울 수 없다)

남은 일은 담당별로 `TODO.md`(Codex) · `TODO-CLAUDE.md`(Claude)에 적어 둔다.
```

## 8. 개발 중 로그인

로그인은 이메일·비밀번호 자체 가입이다. 개발 전용 우회로는 없앴다 —
운영과 다른 경로를 하나 더 두면 운영에서만 나는 버그가 생긴다.

```
npm run dev:all        # Next + 공동 편집 서버
→ http://localhost:3000/login?mode=register
→ 이름 · 이메일 · 비밀번호(12자 이상)로 가입
```

### 공동 편집을 확인하는 방법

같은 노트를 둘이 열어야 한다. 스페이스가 유일한 권한 경계이므로
**한쪽이 만든 스페이스에 다른 쪽을 초대 링크로 넣어야** 같은 노트가 보인다.

1. 일반 창에서 가입 → 스페이스 생성 → 노트 열기
2. 스페이스 화면에서 초대 링크를 발급해 복사
3. 시크릿 창에서 그 링크를 열고 가입 → 같은 노트 열기
4. 한쪽에서 입력하면 다른 쪽에 실시간 반영되고 커서에 이름표가 뜬다

### 세션을 직접 발급할 때

브라우저 없이 API를 찔러 볼 때 쓴다. 비밀번호 없이 세션 행과 쿠키만 만든다.
**개발용이다** — 이 계정은 `/login`으로는 들어올 수 없다(비밀번호가 없다).

```
npm run dev:session 테스터
→ COOKIE=authjs.session-token=...   이 값을 요청 헤더에 넣는다
```

쿠키 이름은 `src/lib/session-cookie.ts`가 정한다. 운영(https)에서는
`__Secure-` 접두사가 붙으므로 직접 적어 넣지 말 것.
