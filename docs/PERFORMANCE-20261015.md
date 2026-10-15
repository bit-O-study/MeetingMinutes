# 2026-10-15 로딩 피드백 및 미가공 이슈 처리

사용자 요청으로 화면·서버 액션까지 수정했다. DB 스키마 변경은 없다.

- 주요 링크를 PendingLink로 연결해 Next useLinkStatus 기반으로 클릭 대기 상태를 표시한다. 프로젝트 하위 경로에 loading 경계를 추가했다.
- 노트 목록은 페이지당 30건, 다음 페이지 확인용 1건만 읽는다. 질문 배지도 같은 정렬/페이지의 30개 본문만 읽는다. 전체 목록은 이전/다음으로 접근한다.
- 초대 주소 또는 복사 버튼 클릭 시 클립보드에 복사한다. 실패하면 선택·수동 복사 안내를 제공한다.
- resolveRawIssue(previous, form): spaceId/id/version/operation(complete|delete)을 검증한다. 멤버십, 프로젝트 ID, raw 상태와 version이 모두 맞아야 변경한다. 완료는 closed로 이동하고 원문을 보존한다. 삭제는 이슈만 삭제하며 채팅 원문은 유지한다.
- openQuestionCounts(spaceId, page = 1): 페이지 범위를 받도록 확장했다.

검증: 타입 검사, webpack 운영 빌드, 단위 테스트 57개, 변경 로직 ESLint 통과.
scripts/verify-interactions.mjs: 실제 DB 임시 데이터와 모바일 Edge에서 완료·동시 충돌·삭제 취소·다른 프로젝트 ID 차단·원문 보존·클립보드 복사·지연 응답 중 로딩 표시·노트 30/1건 페이지·가로 넘침을 확인했다. 테스트 데이터 정리 완료.
실제 운영 지연의 개선 배율은 측정하지 않았다. 아직 푸시·배포하지 않았다.
