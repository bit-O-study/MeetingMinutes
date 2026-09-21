# 회의록 시스템 (MeetingMinutes) — 전체 설계

> 상태: 초안 v1 · 2026-09-20
> 핵심 흐름: **녹음/업로드 → STT(화자분리) → AI 요약 → 편집/승인 → 공유·검색**
> 배포: 클라우드 SaaS (Vercel) · 스택: Next.js + TypeScript

---

## 1. 제품 정의

### 1.1 해결하는 문제

회의는 하는데 기록이 남지 않는다. 남더라도 (1) 작성에 30분 이상 걸리고, (2) 결정사항과 할 일이 문서 안에 묻혀 추적되지 않으며, (3) 3개월 뒤 "그때 뭐라고 했더라"를 찾을 수 없다.

### 1.2 핵심 가치

| 축 | 목표 |
|---|---|
| 작성 시간 | 회의 종료 후 5분 내 검토 가능한 초안 |
| 신뢰성 | 모든 요약 문장이 **원본 발언으로 역추적** 가능 (환각 방지) |
| 실행력 | 액션아이템이 문서를 떠나 **담당자·기한이 붙은 태스크**가 됨 |
| 검색 | 1년치 회의에서 "결제 모듈 관련 결정사항"을 의미 검색 |

### 1.3 비목표 (v1)

- 화상회의 플랫폼 자체 제공 (Zoom/Teams 대체 아님)
- 실시간 라이브 자막 (Phase 3)
- 온프레미스 배포

---

## 2. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router / RSC)                          │
│  녹음 위젯 · 회의록 에디터 · 전사 타임라인 · 검색             │
└───────────┬──────────────────────────────┬───────────────────┘
            │ Server Actions / REST        │ 직접 업로드(서명 URL)
            ▼                              ▼
┌───────────────────────────┐    ┌────────────────────────┐
│ Vercel Functions (Fluid)  │    │ Vercel Blob (private)  │
│  - API Route Handlers     │    │  원본 오디오/영상       │
│  - 인증/권한 · CRUD        │    └────────────────────────┘
└───────────┬───────────────┘
            │ trigger
            ▼
┌──────────────────────────────────────────────────────────────┐
│ Vercel Workflow (durable, 재시도·재개 가능)                    │
│  ingest → preprocess → transcribe → diarize → summarize      │
│         → index → notify                                     │
└───┬────────────────────┬─────────────────────┬───────────────┘
    ▼                    ▼                     ▼
┌─────────┐   ┌────────────────────┐   ┌──────────────────┐
│ STT API │   │ AI Gateway → LLM   │   │ Neon Postgres    │
│(교체가능)│   │ claude-sonnet-5    │   │ + pgvector       │
└─────────┘   └────────────────────┘   └──────────────────┘
```

### 2.1 기술 선택과 근거

| 영역 | 선택 | 근거 |
|---|---|---|
| 프레임워크 | **Next.js (App Router) + TypeScript** | 단일 저장소, RSC로 무거운 회의록 렌더를 서버에서 처리, Vercel 배포 최적 |
| UI | **Tailwind + shadcn/ui** | 에디터·타임라인 같은 커스텀 UI를 조합으로 만들기 좋음 |
| 에디터 | **Tiptap (ProseMirror)** | JSON 문서 모델 → 버전관리·인라인 코멘트·AI 부분 재생성에 유리 |
| DB | **Neon Postgres + Drizzle ORM** | 관계형 + 전문검색 + 벡터를 한 DB에서. 브랜치 기능으로 프리뷰 환경 분리. 무료 티어 존재 |
| 벡터 | **pgvector** | 별도 벡터 DB 불필요. 회의록 규모(수만 세그먼트)에 충분 |
| 파일 | **Vercel Blob (private)** | 서명 URL 단기 발급. 대용량은 클라이언트 직접 업로드 |
| 긴 작업 | **Vercel Workflow** | STT+요약은 수 분~수십 분. 스텝 단위 재시도/재개가 필수 |
| 인증 | **Clerk (Vercel Marketplace)** | Organization/Member 모델 내장 → 멀티테넌시 직접 구현 불필요. MAU 무료 티어 넉넉 |
| STT | **인터페이스로 추상화** (기본: 상용 API, 대안: self-host Whisper) | 한국어 + **화자분리** + 단어 단위 타임스탬프 필요. 비용 구조상 교체 가능성이 높아 처음부터 분리 |
| LLM | **Vercel AI Gateway → `anthropic/claude-sonnet-5`** | 프로바이더 교체·폴백·비용 관측을 코드 변경 없이. 긴 회의 = 긴 컨텍스트 |

> **결정 포인트:** STT 프로바이더는 `TranscriptionProvider` 인터페이스 뒤에 둔다. 한국어 정확도·비용은 실제 사내 회의 녹음 3~5개로 벤치마크한 뒤 확정한다 (§11 POC).

---

## 3. 비용 구조 ★

설계에서 가장 먼저 못 박아야 할 부분. **녹음 자체는 공짜고, 비용은 전사(STT)에서 90% 나온다.**

### 3.1 단계별 비용

| 단계 | 구현 | 비용 |
|---|---|---|
| 브라우저 녹음 | MediaRecorder API (자체 코드) | **0원** |
| 파일 업로드·저장 | Vercel Blob (1시간 ≈ 30~60MB) | 거의 0원 |
| **음성 → 텍스트 (STT)** | 상용 API 또는 self-host | **시간당 $0.25~0.45** ← 지배적 |
| AI 요약 | LLM (map-reduce, in ~60K/out ~4K tok) | 회의당 $0.1~0.3 |
| 임베딩 (검색용) | 임베딩 모델 | 회의당 ~$0.01 |

**1시간 회의 1건 ≈ $0.4~0.8 (대략 500~1,100원)**
월 200건 기준 ≈ **$80~160/월** + 인프라(Neon·Vercel·Clerk) $0~100/월

> 위 단가는 2026년 기준 개략치다. 계약 전 각 벤더 현재 가격표를 반드시 재확인할 것.

### 3.2 개발·초기 운영은 사실상 무료

| 서비스 | 무료 티어 |
|---|---|
| Deepgram / AssemblyAI | 가입 시 무료 크레딧 (수십~수백 시간 분량) |
| Vercel Hobby | 개발·데모 수준 무료 |
| Neon Postgres | 무료 플랜 존재 |
| Clerk | MAU 무료 구간 넉넉 |
| Vercel Blob | 소량 무료 |
| LLM | 사내에 기존 API 키가 있으면 추가 계약 불필요 |

→ **MVP 개발과 사내 파일럿까지는 추가 지출 없이 가능하다.**

### 3.3 비용을 0으로 만들려면 (self-host Whisper)

| | 상용 STT API | self-host Whisper |
|---|---|---|
| 회의당 비용 | ~$0.4 | **0원** (전기·서버값만) |
| 1시간 전사 소요 | 2~5분 | GPU 있으면 2~5분 / **CPU만이면 15~40분** |
| 화자분리 | 기본 제공 | **별도 구성 필요** (pyannote 등) ← 난이도 높음 |
| 운영 부담 | 없음 | 모델·GPU·큐 직접 운영 |

**권장 경로:** MVP는 상용 STT 무료 크레딧으로 만든다 → 실사용량이 나온 뒤 비용이 부담되면 Whisper로 전환한다. STT를 인터페이스로 분리해뒀으므로 전환 비용은 `lib/stt/` 파일 하나 수준이다.

전환 손익분기: 월 200시간 이상 전사하면 상용 API $80/월 > GPU 인스턴스 운영비와 비슷해진다. **그 아래면 상용 API가 싸고 편하다.**

---

## 4. 데이터 모델

### 4.1 ER 개요

```
organizations ─┬─< users (membership)
               └─< meetings ─┬─< attendees
                             ├─< recordings ──< transcripts ──< transcript_segments
                             │                       └──< speakers
                             ├─< minutes ─┬─< minute_versions
                             │            ├─< comments
                             │            └─< approvals
                             ├─< action_items
                             └─< meeting_tags >─ tags
```

### 4.2 주요 테이블

```sql
-- 회의 (컨테이너)
meetings(
  id uuid pk, org_id uuid, title text, meeting_date timestamptz,
  location text, meeting_type text,          -- 정기/킥오프/1on1/리뷰 ...
  template_id uuid null,
  visibility text,                           -- private | attendees | org
  status text,                               -- created|processing|draft|review|approved|failed
  created_by uuid, created_at, updated_at
)

-- 원본 미디어
recordings(
  id uuid pk, meeting_id uuid, blob_url text, mime text,
  duration_ms int, size_bytes bigint, checksum text,
  status text, purge_after timestamptz       -- 보존정책용
)

-- 전사 결과
transcripts(
  id uuid pk, meeting_id uuid, recording_id uuid,
  provider text, provider_job_id text, language text,
  raw_blob_url text,                         -- 프로바이더 원본 JSON 보관
  status text, word_count int, cost_usd numeric  -- 회의별 실비 추적
)

transcript_segments(
  id uuid pk, transcript_id uuid, speaker_id uuid,
  seq int, start_ms int, end_ms int,
  text text, confidence real,
  fts tsvector,                              -- 전문검색
  embedding vector(1536)                     -- 시맨틱 검색
)
-- idx: (transcript_id, seq), GIN(fts), HNSW(embedding)

-- 화자 → 실제 참석자 매핑
speakers(
  id uuid pk, transcript_id uuid,
  label text,                                -- 'Speaker 1'
  display_name text, resolved_user_id uuid null,
  voice_profile_id uuid null                 -- Phase 3: 화자 음성 등록
)

-- 회의록 본문
minutes(
  id uuid pk, meeting_id uuid, version int,
  content jsonb,                             -- Tiptap 문서
  summary text, decisions jsonb,
  generated_by text,                         -- ai | human | ai+human
  model text, prompt_version text,
  status text, created_at
)

-- 액션아이템 (문서에서 분리된 1급 엔티티)
action_items(
  id uuid pk, meeting_id uuid, minute_id uuid,
  text text, assignee_user_id uuid null, assignee_raw text,
  due_date date null,
  status text,                               -- open|in_progress|done|dropped
  source_segment_id uuid null,               -- ★ 근거 발언
  external_ref jsonb null,                   -- Jira/Notion 연동 시
  created_at, completed_at
)

-- 근거 추적: 요약 문장 ↔ 원본 발언
citations(
  id uuid pk, minute_id uuid,
  block_id text,                             -- Tiptap 노드 id
  segment_id uuid, relevance real
)

approvals(id, minute_id, approver_id, status, comment, acted_at)
comments(id, minute_id, block_id, author_id, body, parent_id, resolved_at)
audit_logs(id, org_id, actor_id, action, target_type, target_id, meta jsonb, at)
share_links(id, meeting_id, token, scope, expires_at, created_by)
```

### 4.3 설계 의도

- **`transcript_segments`가 진실의 원천이다.** 회의록은 파생물이고, 언제든 재생성 가능해야 한다. (요약 프롬프트를 개선했을 때 STT를 다시 돌리지 않아도 된다 = 돈을 아낀다)
- **`citations`가 이 시스템의 차별점.** 모든 결정·액션아이템은 원본 발언 id를 들고 있고, UI에서 클릭하면 해당 시점 오디오가 재생된다. AI 요약을 신뢰 가능하게 만드는 유일한 방법이다.
- **액션아이템은 문서 밖으로 꺼낸다.** 문서 안 체크박스로 두면 추적이 안 된다.
- **`transcripts.cost_usd`** — 회의별 실비를 처음부터 기록한다. 나중에 "self-host로 갈아탈까"를 데이터로 판단하기 위해서.

---

## 5. 처리 파이프라인 (Vercel Workflow)

```ts
// workflows/process-meeting.ts (의사코드)
export async function processMeeting({ meetingId, recordingId }) {
  const media  = await step("ingest",     () => verifyBlob(recordingId));
  const audio  = await step("preprocess", () => extractAudio(media));   // ffmpeg, 16kHz mono
  const job    = await step("transcribe", () => stt.submit(audio));     // 비동기 제출
  const raw    = await step("poll-stt",   () => stt.waitFor(job));      // 지수 백오프 폴링
  const segs   = await step("normalize",  () => saveSegments(raw));
  await          step("diarize-map",      () => guessSpeakers(segs));   // 참석자 명단과 매칭
  await          step("summarize",        () => summarize(segs));       // map-reduce
  await          step("index",            () => embedSegments(segs));
  await          step("notify",           () => notifyAuthor(meetingId));
}
```

**스텝을 나누는 이유:** STT 실패와 요약 실패는 복구 비용이 완전히 다르다. STT는 돈이 들고 느리다. 요약 프롬프트를 고쳐 재실행할 때 전사를 다시 돌리면 안 된다. 각 스텝 결과를 DB에 영속화하고, 워크플로는 실패 지점부터 재개한다.

### 5.1 전처리

- 영상 → 오디오 추출, 16kHz mono 정규화 (Vercel Functions 5GB 번들 → ffmpeg 동봉 가능)
- 무음 구간 제거 → **전사 시간이 곧 비용이므로 침묵을 잘라내면 10~20% 절감**
- 2시간 초과 회의는 무음 경계로 분할 후 병렬 전사

### 5.2 요약 (map-reduce)

긴 회의를 한 번에 넣으면 중간 내용이 뭉개진다.

1. **Map** — 세그먼트를 ~10분 / 화자 전환 경계 단위 청크로 분할 → 청크별 `{논의요지, 결정, 액션, 근거 segment_id[]}` 추출
2. **Reduce** — 청크 결과 병합 → 중복 제거, 시간순 정렬, 안건별 재구성
3. **Format** — 회의 유형 템플릿에 맞춰 Tiptap JSON 생성

```ts
// AI SDK generateObject + Zod
const MinuteSchema = z.object({
  title: z.string(),
  overview: z.string(),
  agenda: z.array(z.object({
    topic: z.string(),
    discussion: z.string(),
    sourceSegmentIds: z.array(z.string()),     // ★ 근거 강제
  })),
  decisions: z.array(z.object({
    text: z.string(),
    rationale: z.string(),
    sourceSegmentIds: z.array(z.string()),
  })),
  actionItems: z.array(z.object({
    text: z.string(),
    assignee: z.string().nullable(),
    dueDate: z.string().nullable(),
    sourceSegmentIds: z.array(z.string()),
  })),
  openQuestions: z.array(z.string()),
});
```

**환각 방지 3중 장치**

1. 스키마에서 `sourceSegmentIds`를 필수로 요구한다
2. 후처리에서 존재하지 않는 segment id를 참조하면 해당 항목을 폐기하고 1회 재시도한다
3. UI에서 근거가 없는 항목에는 "⚠ 미검증" 배지를 표시한다

### 5.3 진행 상황 전달

- 워크플로가 `meetings.status` + `jobs` 테이블을 갱신
- 클라이언트는 SSE(`text/event-stream`)로 구독 → 단계별 진행률 표시
- 1시간 회의 기준 목표: 전사 ~3분, 요약 ~1분

---

## 6. 화면 설계

| 경로 | 화면 | 핵심 요소 |
|---|---|---|
| `/` | 대시보드 | 최근 회의, 내 액션아이템, 검토 대기 |
| `/meetings` | 목록 | 기간·참석자·태그·상태 필터, 무한 스크롤 |
| `/meetings/new` | 생성 | 파일 업로드(드래그) / 브라우저 녹음 / 캘린더에서 가져오기 |
| `/meetings/[id]` | 처리 중 | 단계별 진행률, 예상 완료 시간 |
| `/meetings/[id]/edit` | **핵심 화면** | 3분할 레이아웃 (아래) |
| `/meetings/[id]/review` | 검토·승인 | 변경 이력, 코멘트 해결, 승인자 지정 |
| `/search` | 통합 검색 | 하이브리드 검색, 회의/발언 단위 결과 |
| `/actions` | 액션아이템 | 담당자별 칸반, 기한 임박 알림 |
| `/templates` | 템플릿 | 회의 유형별 구조·요약 프롬프트 |
| `/settings` | 설정 | 조직·멤버·연동·보존정책·**사용량/비용** |

### 6.1 편집 화면 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│ 2026-09-20 제품 기획 정기회의        [초안]  [검토요청] [공유]    │
├────────────────────────────────┬────────────────────────────────┤
│  회의록 (Tiptap)                │  전사 타임라인                  │
│                                │  ┌──────────────────────────┐  │
│  ## 결정사항                    │  │ ▶ ━━━━●━━━━━ 12:34/58:02 │  │
│  • 결제 모듈은 3분기로 연기      │  └──────────────────────────┘  │
│    └ 🔗 김OO 12:34  ←클릭       │  [김OO] 12:34                  │
│                                │   결제 쪽은 이번 분기엔          │
│  ## 액션아이템                  │   무리일 것 같고요...  ←하이라이트│
│  ☐ API 스펙 초안 @박OO 9/27     │                                │
│    └ 🔗 박OO 41:02             │  [박OO] 41:02                  │
│                                │   그럼 제가 스펙 초안을...       │
├────────────────────────────────┴────────────────────────────────┤
│ 액션아이템  담당자  기한  상태            [+ 추가] [Slack 전송]   │
└─────────────────────────────────────────────────────────────────┘
```

**상호작용 규칙**

- 회의록의 🔗 클릭 → 우측 전사 스크롤 + 해당 시점 오디오 seek + 하이라이트
- 전사 문장 드래그 → "회의록에 추가" / "액션아이템으로" 컨텍스트 메뉴
- 블록 단위 AI 재생성 — 특정 안건만 톤·길이를 바꿔 다시 뽑기 (전체 재생성보다 훨씬 싸다)
- 화자 이름 인라인 수정 → 전체 문서에 일괄 반영

---

## 7. 검색

한국어 형태소 분석기를 관리형 Postgres에 붙이기 어렵다는 제약을 전제로 설계한다.

**하이브리드 검색 (RRF 결합)**

1. 어휘 검색 — `pg_trgm` 유사도 + `tsvector`(simple 설정). 고유명사·숫자·약어에 강함
2. 의미 검색 — pgvector HNSW. "결제 관련 결정" 같은 개념 질의에 강함
3. Reciprocal Rank Fusion으로 병합 (`score = Σ 1/(60+rank)`)

```
검색 결과 카드
┌────────────────────────────────────────────┐
│ 제품 기획 정기회의 · 2026-09-20             │
│ "…결제 모듈은 3분기로 연기하기로…"          │
│ 김OO 12:34   [회의록 보기]  [▶ 재생]        │
└────────────────────────────────────────────┘
```

권한 필터(`org_id`, visibility, 참석자)는 **벡터 검색 이전에** 적용한다 — 사후 필터링하면 결과가 비거나 정보가 샌다.

---

## 8. 보안 · 권한 · 컴플라이언스

### 8.1 권한 모델

| 역할 | 범위 |
|---|---|
| Owner | 조직 설정, 결제, 전체 회의 |
| Admin | 멤버 관리, 보존정책, 전체 회의 |
| Member | 회의 생성, 본인 참석 회의 열람/편집 |
| Guest | 공유받은 회의만 읽기 |

회의 단위 `visibility`: `private`(작성자) / `attendees`(참석자) / `org`(조직 전체)
→ 모든 쿼리는 Drizzle 레이어의 `withAccess(userId)` 헬퍼를 강제 경유한다.

### 8.2 데이터 보호

- Blob은 **private**, 재생은 60초 만료 서명 URL
- 전송 TLS / 저장 암호화 (Neon·Blob 기본)
- 외부 공유 링크: 만료·비밀번호·다운로드 금지 옵션
- 감사 로그: 조회·편집·공유·삭제 전부 기록

### 8.3 개인정보 (한국 기준)

회의 음성은 개인정보에 해당한다. 최소한 다음이 필요하다.

- **녹음 고지** — 회의 생성 시 참석자 고지 문구 + 녹음 중 UI 표시
- **보존정책** — 원본 오디오 기본 90일 후 자동 삭제 (Cron Job), 회의록 텍스트는 유지. 조직별 설정 가능. *부수 효과로 스토리지 비용도 억제된다.*
- **파기 요청** — 회의 단위 완전 삭제 (Blob + DB + 벡터)
- **국외 이전 고지** — STT/LLM API가 해외 리전이면 위탁·국외이전 고지가 필요하다. 문제가 되면 self-host Whisper + AI Gateway 리전 고정으로 전환한다 (인터페이스 추상화 덕에 가능)

---

## 9. 디렉터리 구조

```
/
├─ app/
│  ├─ (auth)/                       sign-in, sign-up
│  ├─ (app)/
│  │  ├─ dashboard/ meetings/ search/ actions/ templates/ settings/
│  │  └─ meetings/[id]/(edit|review)/
│  ├─ api/
│  │  ├─ upload/route.ts                 # Blob 클라이언트 업로드 토큰
│  │  ├─ meetings/[id]/stream/route.ts   # SSE 진행상황
│  │  ├─ stt/callback/route.ts           # STT 웹훅
│  │  └─ cron/purge/route.ts             # 보존정책
│  └─ layout.tsx
├─ workflows/
│  └─ process-meeting.ts
├─ lib/
│  ├─ db/       schema.ts, queries/, access.ts
│  ├─ stt/      index.ts, deepgram.ts, whisper.ts   # ★ 프로바이더 추상화
│  ├─ ai/       summarize.ts, schemas.ts, prompts/, embed.ts
│  ├─ search/   hybrid.ts
│  └─ auth/     clerk.ts, rbac.ts
├─ components/
│  ├─ editor/      MinuteEditor.tsx, CitationMark.tsx
│  ├─ transcript/  Timeline.tsx, AudioPlayer.tsx, SpeakerChip.tsx
│  ├─ recorder/    RecordButton.tsx          # MediaRecorder, 비용 0
│  └─ ui/          (shadcn)
├─ drizzle/     migrations
└─ docs/DESIGN.md
```

### 9.1 STT 추상화 (교체 가능성이 설계의 전제)

```ts
// lib/stt/index.ts
export interface TranscriptionProvider {
  submit(audio: AudioRef, opts: { language: string; diarize: boolean }): Promise<JobRef>;
  waitFor(job: JobRef): Promise<RawTranscript>;
  estimateCost(durationMs: number): number;
}

// 환경변수 하나로 교체
export const stt: TranscriptionProvider =
  process.env.STT_PROVIDER === "whisper" ? whisperProvider : deepgramProvider;
```

---

## 10. 로드맵

### Phase 1 — MVP (3~4주)

업로드 → STT → 요약 → 편집 → 공유. 단일 조직, 기본 권한.
**완료 기준:** 실제 사내 회의 녹음으로 "손으로 고칠 게 20% 이하인 초안"이 나온다.
**비용:** 무료 크레딧 범위 내

### Phase 2 — 실무 투입 (3주)

하이브리드 검색 · 액션아이템 트래킹 · 템플릿 · 검토/승인 워크플로 · 보존정책 · 사용량 대시보드

### Phase 3 — 확장 (4주)

브라우저 실시간 녹음 + 라이브 전사 · Google/Outlook 캘린더 연동 · Slack 봇(요약 자동 전송, 액션 리마인더) · 화자 음성 프로필 등록

### Phase 4 — 고도화

조직 회의 분석 대시보드(시간·참석 패턴·액션 완료율) · Jira/Notion 양방향 연동 · 다국어 · 필요 시 self-host STT 전환

---

## 11. 먼저 검증할 것 (POC)

1. **한국어 STT 정확도** — 사내 실제 녹음 3~5개로 상용 API vs Whisper 비교. 특히 **화자분리 정확도**와 **사내 용어·영어 혼용** 처리. ← 이게 무너지면 나머지 설계가 의미 없다.
2. **요약 품질** — 60분 회의 map-reduce 결과에 결정사항 누락이 없는지, 사람 회의록과 대조.
3. **Citation 정확도** — 근거 segment id가 실제로 해당 문장을 가리키는지. (모델이 그럴듯한 id를 지어낼 수 있다)
4. **실제 단가** — 회의 5건 처리 후 `transcripts.cost_usd` 합계로 추정치 검증.

---

## 12. 열린 이슈

- [ ] 실시간 공동 편집이 필요한가? (Yjs + Vercel WebSocket) — Phase 2에서 판단. v1은 단일 편집자 + 낙관적 잠금으로 충분해 보인다
- [ ] 기존 사내 인증(SSO/LDAP) 연동 필요 여부 → Clerk SAML로 커버되는지 확인
- [ ] 회의 원본 **영상**까지 보관할 것인가, 오디오만 남길 것인가 (스토리지 비용 10배 차이)
- [ ] STT/LLM 국외 이전에 대한 사내 보안 정책 확인
- [ ] 예상 월 회의 건수 — self-host 전환 손익분기(월 ~200시간) 판단에 필요
