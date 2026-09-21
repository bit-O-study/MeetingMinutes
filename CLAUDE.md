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

1차 범위는 전부 구현했다. 남은 것과 그 이유는 `docs/TODO-CLAUDE.md`에 적어 둔다.
짧게는 이렇다.

1. **Vercel 배포** — 환경변수 이관, Fluid Compute 확인.
   배포에는 `npm run collab`이 필요 없다. `/api/collab/[noteId]`가 업그레이드를 받는다.
2. **배포 후 공동 편집 실측** — 업그레이드 라우트는 Vercel 런타임에서만 뜬다.
   로컬에서는 개발 서버(:1234)까지만 확인할 수 있다.
3. **비밀번호 로그인 점검** — Codex가 구현해 두었다. 시도 제한과 쿠키 이름 결정을
   `docs/TODO-CLAUDE.md`에 적어 둔 대로 다시 볼 것.

## Codex와 겹치지 않기

- Codex가 「요청 큐」(`docs/work-split.md`)에 적은 스키마·액션 요청을 먼저 처리한다.
  거기가 막히면 Codex 전체가 막힌다.
- 스키마를 바꾸면 `npm run db:generate` 후 마이그레이션을 커밋하고,
  work-split.md의 변경 로그에 한 줄 남긴다.
- Codex 담당 파일은 열어 보기만 하고 수정하지 않는다. 문제가 보이면
  「요청 큐」에 적는다.
