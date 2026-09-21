# 회의록

개발 스터디 회의와 인수인계 메모를 **여러 명이 동시에 쓰고 함께 관리하는** 기록 도구.

## 시작하기

```bash
cp .env.example .env.local     # DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_APP_URL 채우기
npx auth secret                # AUTH_SECRET 생성
npm run db:migrate             # 마이그레이션 적용
npm run dev:all                # Next(:3000) + 공동 편집 서버(:1234)
```

`/login`에서 이메일·비밀번호로 회원가입하고 로그인합니다. Google OAuth 설정은 필요하지 않습니다.
비밀번호는 12~128자이며 scrypt 해시만 저장합니다. 기존 계정과 스페이스는 유지되며,
기존 계정의 이메일로 새 비밀번호를 등록할 수 없습니다. 이메일 인증·비밀번호 재설정은 아직 제공하지 않습니다.

Vercel 배포 전 `npm run db:migrate`로 `0003`까지 적용하고, Production 환경에
`DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`을 설정합니다.
환경변수를 변경했다면 재배포합니다.

인증 검증: `npm run test` 및 운영 빌드 서버(`npm run build`, `npm run start -- --port 3100`)를
실행한 상태에서 `npx tsx scripts/verify-password-auth.mts`를 실행합니다.
로컬 운영 서버에서는 `AUTH_TRUST_HOST=true`를 설정합니다. 이 검증은 설정된 DB에 임시 계정을 만들고 종료 시 해당 계정만 삭제합니다.

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
이메일·비밀번호 + Auth.js v5 DB 세션 · Tiptap 3 + Yjs
