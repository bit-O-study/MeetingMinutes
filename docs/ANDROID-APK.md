# moa Android APK (옛 이름: 프로젝트 메모)

- [APK 다운로드](https://github.com/bit-O-study/MeetingMinutes/raw/refs/heads/main/releases/apk/moa-1.0.2-debug.apk)
- 실행하면 `https://meeting-minutes-orcin.vercel.app`에 바로 연결됩니다. 주소 입력/연결 설정 화면은 없습니다.
- SHA-256: `5b8ffc0911b70f0ab780470c7328e558f4f18d2941036542c03453fd02bcaaa6`
- 2026-10-14 APK 저장소 등록 전 `npm run typecheck` / `npm run build` 통과.

- 산출물: `releases/apk/moa-1.0.2-debug.apk` (개발용 서명, 직접 설치용)
- 패키지: `kr.bito.projectmemo`, Android 8 이상, target SDK 36.
- 운영 메모 주소가 앱에 내장되어 있으며 로그인 쿠키를 유지한다. 이전에 입력한 주소 설정은 사용하지 않는다.
- 인터넷과 운영 중인 메모 웹 서버가 필요하다. APK 자체에 Next.js 서버나 DB는 포함하지 않는다.
- 다른 사이트 링크는 외부 브라우저로 연다. HTTP, 파일 접근 및 혼합 콘텐츠는 허용하지 않는다.
- 이번 채팅/입력 보완이 운영 앱에 보이려면 이 저장소의 웹 변경이 배포되어 있어야 한다. 2026-10-14 사용자 요청으로 DB 적용 및 운영 배포 완료(4089b49).

## 빌드

JDK 21 및 Android SDK 36이 필요하다. 환경 변수 `JAVA_HOME`, `ANDROID_HOME`을 설정하고 `android/local.properties`에 SDK 경로를 작성한다.

```powershell
cd android
./gradlew.bat assembleDebug --no-daemon
```

## 2026-10-14 검증

- 웹: TypeScript, production build, 56 tests 통과. ESLint 오류 없음(기존 Avatar 이미지 경고 1개).
- Android: assembleDebug 성공, APK 서명 확인 성공.
- 연결된 ADB 기기가 없어 설치·실제 한글 키보드·로그인 실기기 검증은 미실시.
- 노트 본문 자동 교정/맞춤법 개입을 끄고 조합 중 저장·할 일 동기화는 지연한다. 임의의 w/3 문자를 지우지는 않는다. 실제 문제 원인은 아직 확정되지 않았으며 실기기 재현 확인이 필요하다.
- 프로젝트 메인이 채팅 화면이다. 일반 메시지는 project_messages에 저장하고 메시지의 이슈 버튼을 눌러야 미가공 이슈로 담긴다. 가공 화면에서 원문과 제목/내용/담당자/우선순위를 함께 보고 실제 이슈로 등록한다. 원문은 유지된다.
- 0006_narrow_galactus.sql 마이그레이션(채팅 테이블, 원문/연결 컬럼, 메시지별 이슈 고유 인덱스)을 생성했다. 2026-10-14 운영 DB에 적용 후 웹 배포 완료.
- 기존 스페이스 권한 검사 적용, 메시지 전송 UUID 및 이슈 원본 메시지 고유 인덱스로 재시도 중복 방지, 전송 실패 시 입력 유지.
- 운동 영상은 진행 중이던 후보까지 완료 후 중단(274종 등록, 양테마 검토 255종). 전체 운동 완료 아님.

## 1.0.1 바로 연결 수정

- 주소 입력 화면과 상단 연결 설정 버튼 제거, 운영 앱으로 바로 연결.
- versionCode 2, 기존 1.0.0과 패키지 및 서명 인증서 동일: 기존 앱 위에 업데이트 가능.
- assembleDebug, apksigner verify, aapt 버전 확인, npm run typecheck, npm run build 통과. 실제 휴대폰 설치/실행은 미검증.

## 1.0.2 이름·아이콘 변경 (2026-10-14)

- 앱 이름 `프로젝트 메모` → `moa`. 아이콘은 웹 로고와 같은 기호(겹친 노트 두 장 + 체크)의 적응형 아이콘(파랑→보라 그라데이션, Android 13 테마 아이콘 지원).
- versionCode 3, 패키지·서명 인증서는 1.0.1 과 동일(SHA-256 5988474c…48a6) — 기존 앱 위에 업데이트로 설치된다.
- 화면(재디자인·하단바)은 웹 배포로 바뀌므로 APK 와 무관하다. 이 APK 는 바탕화면 이름·아이콘 때문에 다시 만든 것이다.
- assembleDebug, apksigner verify, aapt 로 이름·버전·아이콘 확인. 실제 휴대폰 설치는 미검증.
