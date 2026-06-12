# 상세페이지 제작자 메모리 인덱스

이 도메인의 메모리 파일 목록.

## 진척 스냅샷 (이걸 먼저 읽으세요)
- **[v0.9 — ChatGPT(조) 자동 통합 완성 (2026-06-13)](./project_v0.9_chatgpt_project_integration.md) — 「① 기획」 한 번으로 plan → ChatGPT(조) 진입(펼침 + 더 보기) → 기존 대화 N개 재활용 → 사장님 제품 사진 자동 첨부 → 결과 PNG 다운로드 → Step 3 슬롯 자동 채움. Phase E 자동 테스트 447초 풀 플로우 성공 (커밋 591818c). 핵심 자산: chatgpt-image.mjs(약 850줄, generateImagesInProjectParallel + enterProject 4중 폴백 + findConversationUrls + attachImageToInput + captureExistingImageUrls + isStillGenerating + dismissBlockingModals), server.js(잡 직렬화 큐 + parallel 라우트 + /generated 정적 + realpath 2중 검증), app.js(autoGenerateViaChatGPT + regenerateSingleSlot), 슬롯 카드 「↻ 다시 만들기」 UI. 12건 패치 누적(Codex 5 + 추가 7). 미해결: conversation 학습 오염 → 사장님이 빈 대화 9개+ 새로 만드는 게 정답 (사장님 결정 대기).**
- [인계 — v0.9 ChatGPT 이미지 생성 통합 방향 논의 (2026-06-11)](./handoff_2026-06-11_v0.9_chatgpt_integration.md) — 결정 단계 인계 메모. 위 v0.9 완성 메모로 superseded.
- **[v0.8.0 — Higgsfield 통합 전면 제거 + ChatGPT 자리표시 (2026-06-10)](./project_v0.8_chatgpt_workflow.md) — 사장님 결정: Higgsfield 구독 해지·MCP/스킬/CLI/v0.7 코드 일체 제거. Step 2 = 영문 프롬프트 카드 + 「🖼️ ChatGPT 새 탭에서 열기」 버튼(클립보드 자동 복사). Step 3 = ChatGPT에서 만든 PNG를 슬롯 드래그/클릭 업로드. 향후 Codex 또는 커스텀 MCP로 ChatGPT 이미지 생성 자동화 통합 예정(조사 단계). v0.7 관련 메모리는 `_archive/` 보존.**
- **[v0.5.6 — claude Write 도구 차단 + _restore.mjs 복원 패턴](./project_v0.5.6_html_restore_tools_block.md) — claude가 Write로 직접 저장 시도 → "권한 거부" 안내만 받고 HTML 실체 없음. `--tools ""` + prompt "도구 사용 절대 금지" 가드 동시 적용으로 종결. `_restore.mjs`로 `_last_prompt.txt` 재실행 복원 패턴. ROCKMAN ZERO 향수 11섹션 20.8KB 복원 성공. 2026-05-25.**
- **[v0.5.5 — Job 취소/heartbeat + render-jpeg·extract job 전환](./project_v0.5.5_job_cancel_render_extract.md) — Codex 진단 1-2·6-1·6-2 미반영 3건 종결. POST /api/jobs/:id/cancel + 30초 heartbeat 자동 취소 + claude proc 강제 종료 + 페이지 닫기 시 navigator.sendBeacon 자동 취소. render-jpeg / extract도 background job 통일. 16-byte job_id. 2026-05-22.**
- [v0.5.4 — Codex 종합 리뷰 4건 반영](./project_v0.5.3_background_job_total_debug.md) — 7777 PID 검증·description prompt injection 격리·길이 500자 제한·SERVER_VERSION 자동(package.json + git commit). 2026-05-21.
- [v0.5.3 — Background Job + 자동 재시작 + 서버 버전 감지 + 전면 디버깅](./project_v0.5.3_background_job_total_debug.md) — timeout 4가지 원인(stdin 인코딩·timeout 부족·서버 재시작 미반영·HTTP 단일 요청 한계) 4일간 반복 사장님 화남 후 전면 종결. background job + polling 인프라, start_hidden.vbs/서버 재시작.bat 자동 재시작, SERVER_VERSION 자동 감지. 본질 root cause = 서버 재시작 미반영. Codex 진단 통합. 2026-05-21.
- [포트폴리오 3브랜드 자료·프롬프트](./project_portfolio_3brands_2026-05-21.md) — 크몽 비승인 보완. 코존(파워에너지바)·미니멀리스트(루미노엣지)·이브덴(카메라 팬던트). 네이버 API 조회 + PNG 시각 추출 실 카피 + PC 전체 원본 자료 600+개 3브랜드 분류 + 도구 v0.5.3 입력 prompt 3종. .gitignore output/ 함정 발견. 2026-05-21.
- [인계 — v0.5.2 사장님 테스트 (2026-05-21)](./handoff_2026-05-21_v0.5.2_test.md) — v0.5.2 흐름 테스트용 체크리스트. v0.5.3 적용 전 인계 메모.
- **[v0.5.2 ⚡ 2단계 자동 연쇄 + cmd.exe UTF-8 우회 + config 핫 리로드](./project_v0.5.2_direct_chain_cmd_utf8.md) — ⚡ 직접 제작이 plan(짧음) + generate(짧음) 두 호출 자동 연쇄로 분산해 timeout 회피. Node v24 .cmd shell:false → EINVAL 발견, cmd.exe /c + chcp 65001 우회로 한글 stdin 깨짐 동시 해결. callClaude 핫 리로드로 서버 재시작 없이 timeout 변경 반영. Codex 2라운드 진단. 2026-05-20.**
- [v0.5 2칸 이미지 입력 + 3-mode + 상품 락 + 자동 저장 + 상시 다운로드 버튼](./project_v0.5_image_split_3mode_autosave.md) — Step 1 dropzone 좌(제품)/우(기타) 분할, 프롬프트 카드 3-mode 명시(신규/제품기준/서브보완) + 첨부 사진 썸네일, 상품 카테고리 락 사전(약70개), 결과 HTML 도메인/output/ 자동 저장, 다운로드 두 버튼 상시 노출. Codex 1라운드 반영(CSP·MIME allowlist·중복키·fallback·중복클릭 가드). 2026-05-15.
- [v0.4 과연 결 정정 + 이미지 오버레이 자유도 + 다운로드 UI](./project_v0.4_reference_correction.md) — 사장님 제공 URL 3건으로 진짜 과연 결(Pretendard 산세리프·카테고리 적응·둥근 카드) 확정. kwayeon.json 전면 재작성, 잘못된 1차 명세는 _archive 보존. buildReferenceBlock 강화. 결과 다운로드 두 칸 최상단으로. 2026-05-15.
- [v0.3 워크플로우 4-Step + JPEG 변환](./project_v0.3_workflow_jpeg.md) — 카피만 받지 말고 기획→프롬프트→슬롯→최종 HTML 흐름. JPEG zip 자동분할. 2026-05-14.
- [v0.2 상태 + 다음 작업 후보](./project_v0.2_status.md) — 도구 자체 시스템 전체 그림, 5개 에이전트, 이미지 프롬프트 매트릭스, 다음 작업 10개 후보. 2026-05-13.
- [크몽 판매 페이지 v1 (1차 완성)](./project_kmong_sales_page_v1.md) — dehayoung 사장님 크몽 서비스 등록용 상세페이지. 10장 JPEG 분할 완료. 2026-05-13.

## 영구 원칙 (피드백)
- **[구매 CTA 버튼 디자인 금지](./feedback_no_cta_button.md)** — 오픈마켓 상세페이지는 이미지 안 버튼이 클릭 작동 안 함. "지금 구매하기" 같은 버튼 형식 디자인 영구 X. 사장님 명시 요청 시에만 추가. 2026-05-21 직접 지시.
- **[claude CLI 텍스트 응답 강제 — --tools "" + prompt 가드 동시 적용](./feedback_claude_cli_text_only.md)** — 상세페이지 HTML 생성처럼 텍스트로만 받아야 하는 claude CLI 호출은 spawn `--tools ""` + prompt "도구 사용 절대 금지" 두 방어 동시 적용. 한쪽만 두면 escape 깨지거나 claude가 Write 시도 → "권한 거부" 본문 자리 출현. 2026-05-25 ROCKMAN ZERO 사건 후 확정.

## 도구 & 플랫폼
- [Claude Design 종합 자료](./claude_design_study.md) — Anthropic의 디자인 도구 (claude.ai/design). 출시 정보·기능·UI·익스포트·핸드오프·한계·프롬프트 베스트프랙티스·상세페이지 워크플로우 정리. 2026-05-12 작성.

## 노하우·레퍼런스
- [토스페이먼츠 상세페이지 작성 노하우 3가지](./reference_tosspayments_tips.md) — 잘 쓴 상세페이지 공통점 3유형(숫자 활용·고객 문제 스토리텔링·리뷰 활용). 카피·섹션 구조 체크리스트 + 자주 쓸 카피 패턴. 토스페이먼츠 블로그 2023-05-04. 2026-05-16 사장님 지시 저장.

## 워크플로우
- 권장 순서: `product-researcher` → `benchmark-analyzer`(선택) → `copy-writer` → `layout-designer` → `page-qa` — 자세한 건 v0.2 상태 메모 참조
- 이미지: Step 2 영문 프롬프트 → 「🖼️ ChatGPT 새 탭에서 열기」(자동 클립보드 복사) → ChatGPT Plus에서 만들기 → 다운로드 → Step 3 슬롯에 드롭

## 아카이브
- v0.7 Higgsfield 통합 관련 메모리는 `_archive/`로 이동 (2026-06-10) — 향후 Codex/커스텀 MCP로 ChatGPT 이미지 생성 자동화 통합 시 패턴 참고용

## 브랜드별 디자인 시스템
(코존코리아/이브덴메모리/미니멀리스트랩스 디자인 시스템 셋업 후 기록)
