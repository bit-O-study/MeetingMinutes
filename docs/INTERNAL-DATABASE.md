# 모아 내부 DB 운영

2026-11-13 복구·전환 기록.

- 운영 주소: https://memo.helthssu.co.kr
- 서버 PostgreSQL: `127.0.0.1:5433`, DB `bito_moa_20261113024718`.
- 개발 PC: SSH를 통해 `127.0.0.1:15433`으로 같은 내부 DB에 연결한다. DB 포트를 외부에 공개하지 않는다.
- 접속 계정은 해당 DB 전용 소유자이며 PostgreSQL 슈퍼유저를 앱에 사용하지 않는다. 비밀번호는 환경 파일에만 둔다.

## 원인과 복구

서버 내부 PostgreSQL 서비스는 실행 중이었지만, 운영 `config/runtime.env`와 개발 `.env`·`.env.local`이 모두 외부 Supabase 풀러를 가리켰다. 외부 연결의 probe timeout과 CONNECTION_DESTROYED가 인증·목록·저장 후 재조회 실패로 이어졌다. 기존 `bito_memo_cutover`는 10월 말 복원본으로 최신 기록이 누락돼 있었다.

최신 외부 DB를 새 내부 DB로 복원하고, 전환 직전 쓰기를 잠근 상태에서 최신 변경분까지 동기화했다. 27개 테이블 502개 행의 건수와 행 데이터 해시를 비교해 일치를 확인했다. 날짜의 마이크로초 정밀도도 보존했다. 사용자·세션·노트·할 일·이슈·프로젝트 분류·모임·자료실 메타데이터 및 마이그레이션 이력을 함께 옮겼다. 파일 본문은 기존 서버 디스크 경로를 유지한다.

앱의 TLS 강제 설정은 루프백 연결에 한해 해제했다. 외부 호스트에는 TLS를 계속 요구한다. 이전 Vercel 주소는 경로를 유지한 307 응답으로 운영 주소에 보낸다. 이전 외부 DB에는 쓰기를 차단하는 `moa_internal_cutover_guard` 트리거를 설치해 예전 실행본이 별도 기록을 남기지 않게 했다.

## 개발 연결

`.env.example`의 `DATABASE_SSH_*` 항목과 내부 DB 접속 정보를 `.env.local`에 설정한다. 기존 개발 PC의 `.env`와 `.env.local`은 내부 접속으로 변경돼 있다.

```powershell
npm run dev -- --port 3210
# 터널만 직접 유지하려면
npm run db:tunnel
```

`predev`가 터널을 준비한다. SSH 호스트 키 검증을 끄지 않는다. 터널 로그는 `.data/db-tunnel/ssh.log`, 프로세스 기록은 `.data/db-tunnel/process.json`이다. 연결이 끊기면 터널 실행기가 재접속한다. 개발도 운영 DB에 연결하므로 검증은 임시 계정·프로젝트만 사용하고 끝나면 정리한다.

## 배포와 복구 시 주의

- 서버 환경: `C:/services/Bit-O/MeetingMinutes/config/runtime.env`. `DATABASE_TARGET=internal` 표시가 있으면 배포 설정 도구는 기존 내부 DB 주소를 보존한다.
- `NEXT_PUBLIC_APP_URL`은 빌드 때 `https://memo.helthssu.co.kr`로 지정해야 한다. 개발용 localhost로 빌드한 파일은 저장소 워커 시작에 실패한다. Windows 배포 워크플로에 운영 주소를 반영했다.
- 전환 정보: 서버 `config/internal-db-recovery.json`. 접속 정보가 포함돼 있으므로 출력·커밋하지 않는다.
- 원본 백업 및 전환 전 설정: `D:/bito-db/backups/moa-20261113024718/`. 로컬 환경 백업: `.data/db-recovery/`.
- 전환 뒤 새 데이터는 내부 DB에만 쌓인다. 실행본을 되돌려도 DB 주소를 옛 외부 DB로 돌리지 않는다. 데이터 복구가 필요하면 내부 DB를 먼저 백업하고 최신 변경을 대조해야 한다.

## 검증

- 단위 테스트 150개, 타입 검사, 운영 빌드 통과.
- 내부 DB를 사용한 인증 페이지 5개 정상 응답(서버 내부 21~169ms).
- 운영 HTTPS와 로컬 개발 서버에서 플래너 통합 검증 각각 통과: 등록, 새로고침 유지, 자동 수정, 완료, 삭제, 서울 시간, 종일 전환, 다른 계정 조회·수정 차단, 미로그인 차단, 320/390px 표시.
- 사용한 임시 계정과 데이터 정리 완료. 파일 업로드와 공동 편집 전체 흐름은 이 DB 복구 검증의 범위에 포함하지 않았다.
