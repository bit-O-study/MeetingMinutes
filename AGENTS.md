<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 회의록 (meeting-minutes)

개발 스터디 회의와 인수인계 메모를 **여러 명이 동시에 쓰고 함께 관리하는** 기록 도구.

설계 문서를 먼저 읽을 것. 구현 판단의 근거가 전부 여기 있다.

- `docs/functional-design.md` — 기능 설계 v2 (무엇을 만들고 무엇을 안 만드는가)
- `docs/work-split.md` — **에이전트 분담과 파일 소유권**
- `docs/DESIGN.md` — 기술 설계 (v1 기준. 범위 축소 전 문서라 참고용)

## 스택

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4
Drizzle + Postgres · Auth.js v5 (Google) · Tiptap 3 + Yjs

## 명령

```bash
npm run dev          # Next 개발 서버
npm run collab       # 공동 편집 WebSocket 서버 (:1234)
npm run dev:all      # 둘 다
npm run typecheck    # tsc --noEmit
npm run build        # 라우트 타입 재생성 + 전체 검증
npm run db:push      # 스키마를 DB에 반영 (마이그레이션 없이)
```

`.env.example`을 복사해 `.env.local`을 만든다.

## 설계 원칙 — 어기지 말 것

이 규칙들은 기능 설계 v2에서 의도적으로 정한 것이다. 편해 보인다고 바꾸지 말 것.

1. **스페이스가 유일한 권한 경계다.** 노트 단위 권한은 없다. 모든 권한 검사는
   `@/lib/access`의 `requireSpaceMember` / `requireNoteAccess`를 경유한다.
2. **확정·승인 개념이 없다.** 노트 상태는 `작성 중` / `정리됨` 둘뿐이고,
   정리됨으로 바꿔도 계속 편집할 수 있다. 잠금이 아니다.
3. **지연은 상태값이 아니다.** 기한과 완료 여부로 계산한 결과다(`isOverdue`).
   상태 필터 칩에 "지연"을 넣지 말 것. 묶음 제목으로 표현한다.
4. **할 일은 한 곳에만 저장한다.** 본문 체크박스와 우측 패널은 같은 `tasks` 레코드를
   본다(`blockId`가 연결 고리). 두 벌로 관리하면 반드시 어긋난다.
5. **저장 버튼을 만들지 말 것.** 자동 저장이고, 연결 상태 표시가 유일한 안심 신호다.
6. **권한 없음과 존재하지 않음을 구분하지 말 것.** 같은 화면으로 처리한다.
   노트 제목·스페이스명을 절대 노출하지 않는다.
7. **검색은 권한 필터를 조회 이전에 적용한다.** `mySpaceIds()`로 범위를 먼저 좁힌다.
   결과 건수만으로도 정보가 샌다.
8. **노트 편집은 2분할 레이아웃을 유지한다.** 우측 패널에 2차 댓글, 3차 전사가 들어온다.

## 코드 규칙

- UI 문자열은 한국어. 코드 주석도 한국어로, **왜 그렇게 했는지**를 적는다.
- 색은 반드시 토큰으로. `text-ink-2`, `bg-accent-soft` 등. 리터럴 hex 금지.
  토큰은 `src/app/globals.css`에 light/dark 모두 정의돼 있다.
- 서버 컴포넌트가 기본. `"use client"`는 상호작용이 필요한 곳에만.
- 시간대는 `Asia/Seoul` 고정. 날짜 비교는 `todayInSeoul()` 기준.
- 커밋 전 `npm run typecheck`와 `npm run build`가 통과해야 한다.

---

# CODEX 담당 범위

**화면 계층을 맡는다.** 데이터 계층(스키마·액션·권한)은 CLAUDE가 관리하며 이미 구현돼 있다.

## 건드려도 되는 파일

```
src/app/(app)/page.tsx                  S-01 홈
src/app/(app)/s/[spaceId]/page.tsx      S-02 스페이스
src/app/(app)/s/[spaceId]/new/          S-02a 템플릿 선택
src/app/(app)/tasks/page.tsx            S-04 내 할 일
src/app/(app)/search/page.tsx           S-05 검색
src/app/(app)/spaces/new/               스페이스 생성
src/app/join/[token]/                   S-08 초대 링크 참여
src/components/screens/**               위 화면들이 쓰는 컴포넌트 (새로 만들 것)
```

## 절대 건드리지 말 것

```
src/lib/db/**            스키마 — 변경이 필요하면 docs/work-split.md의 절차를 따를 것
src/lib/access.ts        권한
src/lib/actions/**       서버 액션
src/lib/collab/**        공동 편집
src/lib/templates.ts     템플릿
src/components/editor/** 에디터
src/components/ui/**     공용 프리미티브
src/components/shell/**  셸
src/app/(app)/s/[spaceId]/n/[noteId]/**   S-03 노트 편집
server/**                공동 편집 서버
```

**스키마나 서버 액션이 더 필요하면 직접 추가하지 말고**, `docs/work-split.md`의
「요청 큐」 절에 필요한 것을 적어 둘 것. CLAUDE가 구현한다. 그 전까지는 기존 액션으로
가능한 범위까지 만들고 나머지는 `TODO(CODEX)`로 남긴다.

## 작업 순서

1. `src/app/(app)/page.tsx` — 홈. 내 할 일 블록과 스페이스 카드 그리드.
2. `src/app/(app)/tasks/page.tsx` — 내 할 일. 묶음 정렬과 인라인 체크.
3. `src/app/(app)/s/[spaceId]/page.tsx` — 스페이스. 탭 3개와 미해결 질문 수 배지.
4. `src/app/(app)/s/[spaceId]/new/page.tsx` — 템플릿 선택 (`createNote` 액션 사용).
5. `src/app/(app)/search/page.tsx` — 검색.

각 파일 상단 주석에 해야 할 것이 적혀 있다. 한 화면 끝날 때마다
`npm run typecheck && npm run build`를 돌리고 커밋한다.
