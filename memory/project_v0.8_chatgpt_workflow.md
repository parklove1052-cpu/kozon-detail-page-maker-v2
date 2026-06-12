# v0.8 — Higgsfield 통합 전면 제거 + ChatGPT 자리표시 (2026-06-10)

## 무엇

사장님 결정: **Seedance(영상) + ChatGPT(이미지)** 두 도구를 각각 직접 사용. Higgsfield는 구독·통합 일체 제거.

상세페이지 제작 시스템의 v0.7 Higgsfield 자동 생성 흐름을 통째로 걷어내고, 그 자리를 **ChatGPT 새 탭 띄우기 + 영문 프롬프트 클립보드 복사** 흐름으로 교체. 사장님이 ChatGPT 웹에서 만든 이미지를 Step 3 슬롯에 업로드하면 그 다음(HTML 생성·JPEG 분할)은 v0.5.6 흐름 그대로.

## 사장님 새 흐름

1. **Step 1** 기본 입력 (제품/기타 이미지 + 카피 + 스타일)
2. **「① 기획 + 이미지 프롬프트 생성」** → plan + 영문 프롬프트 카드 노출
3. **Step 2** 영문 프롬프트 확인 → **「🖼️ ChatGPT 새 탭에서 열기」** 클릭
   - 모든 영문 프롬프트가 자동 클립보드 복사 + ChatGPT(https://chatgpt.com) 새 탭 오픈
   - 사장님이 ChatGPT 입력란에 Ctrl+V → 이미지 생성 → 다운로드
4. **Step 3** 슬롯 그리드에 PNG 드래그/클릭 업로드
5. **Step 4** ② 상세페이지 HTML 생성 → 다운로드 (HTML + JPEG 분할)

## 제거된 자산 (2026-06-10)

### 외부 결합
- MCP 커넥터 `claude.ai higgsfield ai` (사장님 웹에서 해지)
- 전역 스킬 4종: `higgsfield-generate`, `higgsfield-soul-id`, `higgsfield-product-photoshoot`, `higgsfield-marketplace-cards`
- npm 전역 패키지 `@higgsfield/cli`
- Higgsfield Plus 구독 (사장님)

### 코드 파일 삭제
- `code/lib/higgsfield-cli.js`
- `code/lib/v07-handlers.js`
- `code/lib/inpaint-store.js`
- `code/lib/section-prompts.js`
- `code/public/v07.html`

### 부분 제거
- `code/server.js`
  - v07-handlers require + 초기화 + sendV07Unavailable 제거
  - callClaude `allowTools/bypassPermissions` 분기 제거 (단순 `--tools ""` 만 유지)
  - `/api/v07/*` 6개 라우트 제거
  - /api/health 응답에서 `higgsfield_mode`, `v07` 필드 제거
- `code/config.json` — `higgsfield_mode`, `higgsfield_dry_check` 등 제거
- `code/public/index.html`
  - Step 2: "이미지 슬롯 승인 + Higgsfield 일괄 생성" → "이미지 프롬프트 + ChatGPT로 만들기"
  - Step 3: "자동 생성 결과" → "ChatGPT 결과 이미지 업로드"
  - Inpaint 모달 통째 제거
- `code/public/app.js`
  - state에서 `approvalSlots`, `currentInpaintSlot`, `generateJobId` 제거
  - Higgsfield 함수군 통째 제거 (`buildApprovalSlotsFromPlan`, `callHiggsfieldGenerate`, `regenerateSingleSlot`, `handleGenerateResult`, `fetchPngAsDataUrl`, `renderApprovalGrid`, `refreshApprovalSummary`, `approveAllSlots`, `renderResultGrid`, `zoomSlotImage`, `setGenerationStatus`)
  - Inpaint 모달 함수군 통째 제거 (`openInpaintModal`, `closeInpaintModal`, `applyInpaintFile`, `rollbackInpaint`, `setupInpaintModal`)
  - 새 함수 `openChatGPTNewTab()` 추가 — 클립보드 자동 복사 + ChatGPT 새 탭 오픈
  - bindEvents에서 `btn-higgsfield-generate`/`btn-approve-all`/`btn-reject-all` 제거, `btn-open-chatgpt` 추가
  - init에서 `setupInpaintModal` 호출 제거
  - renderManualSlotCards가 `#slot-grid`(메인)에 렌더
- `scripts/setup.mjs` — Higgsfield 언급 제거
- `scripts/check-auth.mjs` — Higgsfield CLI 체크(§4) 통째 제거
- `상세페이지 제작기.html` — 빌드 태그 `v0.8.0 · 2026-06-10`
- `README.md`, `SETUP_FOR_CLAUDE.md` — Higgsfield 안내 멘트/Q&A 모두 제거 또는 ChatGPT 흐름으로 교체
- `~/.claude/CLAUDE.md` (글로벌) — Higgsfield 4종 스킬 섹션 통째 제거 + Seedance2 섹션은 보존(정책 재편 안내 추가)

### 메모리 아카이브
- `memory/project_v0.7_higgsfield_integration.md` → `memory/_archive/`
- `memory/handoff_2026-06-04_v0.7.10_test.md` → `memory/_archive/`

## 보존

- `seedance2` 스킬 (`~/.agents/skills/seedance2/SKILL.md`) — Seedance 영상 프롬프트 작성용
- v0.5.6 카피·HTML 생성 흐름 (callClaude `--tools ""` + 단계 격리)
- 진입점 자동 부팅 인프라 (`서버 자동시작 등록.bat`, `start_hidden.vbs`, `서버 재시작.bat`)
- Step 1 좌/우 이미지 드롭존(제품/기타)
- Step 4 단일 HTML 생성 + JPEG 분할 + 다운로드 영역
- 우측 패널: 내용 추출하기, 이미지 프롬프트 생성

## Why

- Higgsfield Soul 모델 등의 결과물 일관성과 사장님 워크플로우 적합도 평가 → ChatGPT(GPT Image)가 한국 e-commerce 상세페이지용으로 더 안정적이라 판단
- Seedance는 영상(편집자동화 도메인용)으로 직접 활용
- 외부 도구(MCP/CLI/플러그인 연쇄) 의존이 디버깅 복잡도와 인증 만료 위험을 누적시킴 — 단순화

## 다음 단계 후보

향후 통합 자동화 옵션 조사 (todos 또는 후속 메모리):

1. **Codex(OpenAI)로 ChatGPT 이미지 생성**: Codex가 `images.generate` API를 직접 호출 가능한가? 가능하면 `code/server.js`에 OpenAI API 키 설정 + `/api/v08/generate-images` 신설
2. **Claude용 커스텀 MCP**: `images.generate` 를 wrap한 로컬 MCP 서버를 작성해 Claude Code에 등록. plan → claude(allowTools: 이미지 도구만) 위임으로 자동 생성

두 경로 모두 사장님 OpenAI API 키 또는 ChatGPT Plus 구독 연동 방식 확인 필요. 본 사이클 작업 아님.

## 회귀 방어 메모

- index.html Step 2/3 마크업의 셀렉터 (`#prompt-toolbar`, `#prompt-cards`, `#prompt-total`, `#slot-grid`, `#btn-open-chatgpt`)가 app.js와 일치
- callPlan/callDirectGenerate에서 `buildApprovalSlotsFromPlan` 호출은 모두 제거 — 호출 시 ReferenceError
- 서버 `/api/health` 응답에서 `higgsfield_mode`/`v07` 필드 제거 — UI에서 `serverInfoCache?.higgsfield_mode` 참조 안 함
- callClaude `options.allowTools` 인자는 제거됐으므로 호출처에서 옵션 전달해도 무시됨 (현재 호출처는 plan/generate 두 곳만)
- `code/lib/section-prompts.js`/`inpaint-store.js`/`higgsfield-cli.js`/`v07-handlers.js` 파일 자체가 없으므로 require 시 즉시 throw
- 메모리 _archive는 git history에 살아 있으므로 git log/checkout으로 복구 가능
