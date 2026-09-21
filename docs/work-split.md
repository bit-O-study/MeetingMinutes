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
updateTask(taskId, { body?, assigneeId?, dueDate? })
deleteTask(taskId)
listNoteTasks(noteId)
```

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
| 1 | `createSpace({ name, kind })` 액션 | — | ☐ 미착수 |
| 2 | `createInviteLink(spaceId)` · `joinBySpaceToken(token)` 액션 | — | ☐ 미착수 |
| 3 | `listSpaceMembers(spaceId)` 조회 | — | ☐ 미착수 |
| 4 | 노트별 **미해결 질문 수** 집계 (S-02 배지용) | — | ☐ 미착수 |
| 5 | `searchNotes(query, { spaceIds, from, to, status })` | — | ☐ 미착수 |

새 요청은 아래에 행을 추가한다. 형식: `필요한 것 / 어느 화면에서 / 왜`.

---

## 5. 변경 로그

스키마·액션 시그니처가 바뀌면 여기 한 줄 남긴다. 상대가 깨진 이유를 알아야 한다.

| 날짜 | 변경 | 영향 |
| --- | --- | --- |
| 2026-09-21 | 최초 스캐폴딩. 스키마·권한·액션·셸·에디터 골격 | — |
| 2026-09-21 | Supabase 연결. 마이그레이션 `0000` 적용, 12개 테이블 생성 | `npm run db:migrate`로 최신 상태 유지 |

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

☐ 화면 5개 (Codex)
☐ 체크박스 ↔ tasks 동기화 (Claude)
☐ 이력 · 공유 (Claude)
☐ 구글 OAuth (운영 배포 전에 필요. 개발은 위 임시 로그인으로 진행)
```

## 8. 개발 로그인

구글 OAuth 없이 바로 개발할 수 있다. `/login`에서 이름을 넣으면 들어간다.

```
npm run dev:all        # Next + 공동 편집 서버
→ http://localhost:3000/login
→ 이름 입력 후 [들어가기]
```

첫 로그인 때 **개발용 공유 스페이스**(`개발 스터디 (샘플)`)에 자동으로 들어가고,
스터디 노트와 인수인계 노트가 하나씩 준비된다.

### 공동 편집을 확인하는 방법

모든 개발 계정이 **같은** 스페이스에 들어간다. 각자 자기 스페이스를 만들면
같은 노트를 열 수 없어서 공동 편집을 확인할 수 없기 때문이다.

1. 일반 창에서 `김철수`로 로그인 → 노트 열기
2. 시크릿 창에서 `박영희`로 로그인 → 같은 노트 열기
3. 한쪽에서 입력하면 다른 쪽에 실시간 반영되고 커서에 이름표가 뜬다

`/login`의 「계정 전환」 버튼으로 기존 계정 사이를 클릭 한 번에 옮길 수 있다.

### 세션을 직접 발급할 때

브라우저 없이 API를 찔러 볼 때 쓴다.

```
npx tsx --env-file=.env.local scripts/dev-session.mts 테스터
→ COOKIE=authjs.session-token=...   이 값을 요청 헤더에 넣는다
```

개발 로그인은 `NODE_ENV=development`에서만 동작한다. 운영 빌드에는 렌더조차 되지 않는다.
관련 코드는 `src/lib/actions/dev-auth.ts` 한 파일에 모여 있어서 나중에 통째로 지우면 된다.
