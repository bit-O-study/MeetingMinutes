# 회의록

개발 스터디 회의와 인수인계 메모를 **여러 명이 동시에 쓰고 함께 관리하는** 기록 도구.

## 시작하기

```bash
cp .env.example .env.local     # DATABASE_URL, AUTH_SECRET, 구글 OAuth 채우기
npx auth secret                # AUTH_SECRET 생성
npm run db:push                # 스키마를 DB에 반영
npm run dev:all                # Next(:3000) + 공동 편집 서버(:1234)
```

구글 OAuth 없이도 개발할 수 있습니다. `/login`에서 이름만 넣으면 들어가고,
개발용 샘플 스페이스가 자동으로 준비됩니다. 자세한 건 `docs/work-split.md` §8.

```bash
```

구글 OAuth 리디렉션 URI: `http://localhost:3000/api/auth/callback/google`

## 문서

| 문서 | 내용 |
| --- | --- |
| `docs/functional-design.md` | 기능 설계 v2 — 무엇을 만들고 무엇을 안 만드는가 |
| `docs/work-split.md` | 에이전트 분담과 파일 소유권 |
| `docs/DESIGN.md` | 기술 설계 (범위 축소 전 문서, 참고용) |

## 구조

```
src/
├─ app/
│  ├─ (app)/            로그인 후 화면 — 셸이 감싼다
│  │  ├─ page.tsx           S-01 홈
│  │  ├─ s/[spaceId]/       S-02 스페이스 · S-03 노트 편집
│  │  ├─ tasks/             S-04 내 할 일
│  │  └─ search/            S-05 검색
│  ├─ login/            로그인
│  ├─ join/[token]/     S-08 초대 링크 참여
│  └─ p/[token]/        S-09 공유 열람 (비로그인)
├─ components/
│  ├─ shell/            TopBar · Sidebar
│  ├─ editor/           NoteEditor · TaskPanel · ConnectionBadge
│  ├─ ui/               Avatar · Badge · Panels
│  └─ screens/          화면 전용 컴포넌트
├─ lib/
│  ├─ db/               스키마 · 클라이언트
│  ├─ actions/          서버 액션
│  ├─ collab/           Yjs 클라이언트
│  ├─ access.ts         권한 — 모든 검사가 여기를 지난다
│  └─ templates.ts      템플릿 3종
└─ server/collab.ts     공동 편집 WebSocket 서버
```

## 스택

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle + Postgres
Auth.js v5 (Google) · Tiptap 3 + Yjs
