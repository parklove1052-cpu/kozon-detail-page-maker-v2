# v0.7 — Higgsfield 이미지 생성 통합 (2026-05-27)

## 2026-06-04 — v0.7.11 + v0.7.12 (사장님 1차 테스트 직중 두 단계 패치 후 정상 작동 확인)

사장님이 포스닉 에너지바 prompt로 첫 테스트 시 두 가지 신고 → 각각 codex:rescue 위임으로 패치.

### v0.7.11 — Higgsfield 호출 360초 timeout 9건 (callClaude allowTools=true 분기 cmd.exe 우회)
- **신고**: 🎨 Higgsfield 클릭 시 9 슬롯 모두 "claude 호출 타임아웃 (360000ms)"
- **진단**: `_last_output.txt`가 `[code=1] stderr=빈 stdout=빈`. claude CLI가 stdin 받기도 전에 즉시 exit 1.
- **검증**: `cat prompt | claude -p --output-format text --permission-mode bypassPermissions` 직접 호출은 18.5KB 한글 + 9 PNG (각 3MB) 정상 생성 + 18 크레딧 소비 확인. `cat prompt | cmd.exe /c "chcp 65001 >nul && claude ..."` 재현 시 cmd가 stdin을 자기 prompt로 받아 "'#'은(는) 외부 명령이 아닙니다" 줄줄 (한글 cp949 깨짐). claude 호출 안 됨.
- **Root cause**: `spawn('cmd.exe', ['/c', 'chcp 65001 >nul && claude ...'], { stdio: ['pipe',...] })` 형태에서 stdin pipe가 cmd 자체에 흘러들어가 cmd가 stdin을 후속 명령어로 해석. plan/generate(allowTools=false, prompt 짧음)는 어떻게 잘 돌고 있는지 미스터리지만 어쨌든 v0.7 분기에서만 명확히 깨짐.
- **패치**: `server.js:406-424` — allowTools=true일 때만 `spawn('claude', baseArgs.concat(['--permission-mode','bypassPermissions']), { shell: true, ... })`로 cmd.exe 우회. shell:true가 Windows에서 `claude.cmd` shim 자동 해석. allowTools=false (plan/generate) 분기는 한 글자도 안 건드림 (사장님 명시 제약).
- **결과**: timeout 사라짐. 다음 신고(v0.7.12)로 넘어감.

### v0.7.12 — "Claude 응답에서 슬롯 결과를 찾지 못함" 9건 (파일 검증 final truth)
- **신고**: PNG는 실제 저장되는데 9 슬롯 모두 "결과를 찾지 못함" 에러로 표시. HTML 단계와 연결 안 됨.
- **진단**: claude가 prompt 지시(슬롯별 JSON 한 줄)를 무시하고 `=== DONE ===` 후 "9개 슬롯 전부 gpt_image_2 모델로 생성 완료, 출력 폴더에 PNG로 저장했습니다..." 자연어 요약만 출력. `parseMcpResult`가 line-by-line JSON 0개 → 9 슬롯 모두 에러 마킹. 그 후 magic-byte 검증이 PNG 정상 확인 가능하지만 `okFinal = r.ok && exists && size > 0 && isImage` 조건의 `r.ok && ...`가 false로 차단.
- **Root cause**: claude 응답 파싱(`r.ok`)을 파일 시스템 검증보다 우선시한 게 잘못. 파일이 디스크에 정상 저장돼 있으면 그 자체가 Higgsfield 호출 성공의 증거.
- **패치 3개** (`v07-handlers.js`):
  - A. `:454` `okFinal = r.ok && ...` → `okFinal = exists && size > 0 && isImage` — 디스크 PNG가 final truth
  - B. `:169` `ok: false` → `ok: null` — JSON 못 찾아도 파일 검증에 위임
  - C. `:124` `MANDATORY: 슬롯마다 JSON 한 줄만 출력. 자연어 요약 절대 X` prompt 추가
- **사장님 확인**: 2026-06-04 작동 정상 확인. "ㅇㅋ 일단 돌아가는건 확인했고".

### 부수 발견 — 사장님 노트북 부팅 시 7777 서버 자동시작 실패 root cause
- 사장님 PC startup 폴더에 `KOZON Detail Page Maker.lnk` 등록 OK + wscript가 `start_hidden.vbs` 실행 OK. 그런데 부팅 후 7777 죽어 있음.
- 원인: `start_hidden.vbs:45` `wsh.Exec("cmd /c wmic process where ProcessId=" & pid & " get CommandLine /value")` 호출에서 stuck. Windows 11 최근 빌드에서 `wmic`이 deprecate되어 매우 느리거나 응답 없음. vbs가 PID 검증 단계에서 멈춰 새 `node server.js` 띄우는 단계 도달 못 함.
- **임시 조치**: 즉시 복구는 `Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory ... -WindowStyle Hidden`로 detached node 직접 부팅. 다음 부팅 시 같은 문제 재발.
- **후속 작업 후보 (v0.7.13)**: vbs의 wmic 호출을 PowerShell Get-CimInstance로 교체 또는 PID 검증 자체를 단순화 (포트 검증만). 사장님 1차 테스트 끝났으니 다음 세션에서 다룰 것.

### 포스닉 에너지바 사양 정정 (메모리 기록 누락 보강)
- 기존 `output/prompts/prompt_01_powerenergybar.md`는 **파워에너지바 v.1**: 6가지 맛 (망고·수박·라임·민트·구아바·블루베리)
- **포스닉 에너지바 v.2**는 별도 SKU: **4가지 맛 (레드불·민트·복숭아·청사과) + 멘톨 강화 포뮬러**
- 사장님이 "최종 prompt 보내달라" 요청 시 두 라인업 헷갈리지 말 것. 사장님이 포스닉 v.2 카피 재요청 시 멘톨 강화 + 4맛 사양으로 갈아끼워야 함.

---

## 무엇

기존 v0.5.6 (Claude CLI 위임 + HTML 조립 + JPEG 분할) 흐름에 **이미지 슬롯 자동 생성 단계**를 추가. 사장님이 외부 도구(ChatGPT/Sora)로 이미지 직접 만들고 업로드하던 가장 큰 병목 단계를 자동화.

## 새 흐름

```
사장님 입력 → Claude가 plan(11섹션·슬롯 정의) → 사장님 슬롯별 ✓/✗ → 승인 슬롯만
Higgsfield 자동 생성 → output/{slug}/{slotId}.png → Claude가 HTML 조립 → JPEG 분할
```

이전 흐름 대비 변경 지점은 **Step 3 한 군데** — 나머지는 v0.5.6 그대로.

## 신규 파일

- `code/lib/section-prompts.js` — plan JSON → 슬롯 메타 추출 + 트래버설 방지 정규화 (`normalizeSlotId`)
- `code/lib/inpaint-store.js` — 슬롯 PNG 저장·자동 백업(.history/)·복원, atomic write(temp→rename) + 정규식 escape
- `code/lib/higgsfield-cli.js` — Higgsfield 글로벌 CLI 직접 spawn 래퍼. ※ 사장님 환경에는 **글로벌 CLI 대신 Claude Code 플러그인/스킬**이 설치된 상태 — CLI 모듈은 보존하되 미사용. 향후 사장님 결정에 따라 활용 또는 폐기.
- `code/lib/v07-handlers.js` — 6개 신규 엔드포인트 핸들러 + Higgsfield 호출 + Inpaint 흐름
- `code/public/v07.html` — 새 UI (Step 1 plan 입력 → Step 2 슬롯 ✓✗ → Step 3 결과 + Inpaint 모달)

## 신규 엔드포인트

```
POST /api/v07/section-prompts   plan → slots[] (한국어 설명 + 영문 프롬프트 + 모델·비율)
POST /api/v07/generate-png      승인 슬롯 일괄 생성 (Claude 위임 또는 CLI 직접 모드)
POST /api/v07/inpaint/open      슬롯 PNG → data URL + Higgsfield Inpaint 새 탭 URL
POST /api/v07/inpaint/apply     수정 PNG 받아 슬롯 교체 + .history/ 자동 백업
POST /api/v07/inpaint/rollback  지정 버전 복원
GET  /api/v07/slot              현재 이미지 + 버전 목록
```

## server.js 패치

- `require('./lib/v07-handlers')` + `createV07Handlers({...})` mount (`// ──── 메인 서버 ────` 직전)
- `OUTPUT_ALLOWED_EXT`에 `.png .jpg .jpeg .webp` 추가 + `OUTPUT_IMAGE_EXT` 분리(이미지 응답은 CSP 미적용)
- `callClaude(cwd, prompt, jobRef, options)` 시그니처 확장 — `options.allowTools=true` 시 `--tools ""` 차단 해제하여 MCP·플러그인·스킬 자동 호출 허용. 기본은 false(텍스트 응답 강제 유지 — v0.5.6 룰 보존).
- 6개 신규 라우트 추가 (`/api/extract` 다음, `/uploads/` 앞)

## 핵심 결정 (사장님 지시)

### 1. 풀 페이지 디자인 X → 제품 이미지만
사장님 판단: GPT Image 2가 디자인까지 한 컷에 박는 건 토큰 비용 비효율 (11슬롯 × 5크레딧 = 55/장). 또 PNG라 텍스트 수정 어려움. 시스템 프롬프트에 "NO text, NO captions, NO UI elements, NO marketing copy overlay" 자동 부정 키워드 추가. 카피·UI·텍스트는 v0.5.6 HTML/CSS 그대로.

### 2. CLI vs MCP vs Claude Code 플러그인
- 사장님 환경은 **Claude Code 공식 Higgsfield 플러그인/스킬** 설치 + MCP 연결 (`https://mcp.higgsfield.ai/mcp`) 둘 다 가능 상태
- 별도 글로벌 CLI(`@higgsfield/cli`)는 사장님 환경엔 없음
- **정답 경로**: 사장님 도구의 `callClaude(allowTools: true)` 흐름 — Claude 에이전트가 플러그인·MCP·스킬 중 가용한 것 자동 호출
- 사장님이 v07.html 1차 테스트해서 어느 쪽이 작동하는지 확인 필요 (2026-05-27 시점 미검증)

### 3. Inpaint는 외부 도구 연동
- 자동화 무리하지 말고 Higgsfield 웹 UI에서 수동 처리
- 도구는 "들어가고 나오는 흐름"만 매끄럽게 봉합 — 클립보드 자동 복사 + 새 탭 자동 오픈 + 드래그/Ctrl+V 받기 + 자동 백업 (`.history/`)

## Codex 리뷰 — HIGH 3건 100% 패치, MID 8건

### HIGH (모두 패치 완료)
1. **slot.id 경로 트래버설** — `extractSlots`에서 `normalizeSlotId` 자동 정규화 + `handleGeneratePng`에서 `assertSafeName` 강제. `../../etc/passwd` → `etc_passwd`로 자동 변환 검증 완료.
2. **/output/*.png 404** — `OUTPUT_ALLOWED_EXT` 확장 + 이미지 응답 CSP 분리. GET 200 정상 다운로드 검증 완료.
3. **MCP가 `--tools ""`로 차단** — `callClaude.options.allowTools` 신설. v0.7 generate만 MCP/플러그인 호출 허용.

### MID 패치 (8건)
- `parseDataUrl` MIME allowlist (png/jpeg/webp) + magic byte 검증 + base64 사전 사이즈 검사 (DoS 차단)
- 저장 PNG magic byte 재검증 (`verifyImageFile`) — Claude가 텍스트 파일을 `.png`로 저장하는 사고 방지
- `parseMcpResult`에 fenced JSON / 배열 fallback parser
- `listVersions` 정규식 메타문자 escape
- `saveSlot` atomic write (temp → rename)
- `clampMaxBody` base64 33% 증가 반영
- 실패 슬롯 카드에 🔄 재생성 버튼 + plan JSON paste 4MB 사전 검사

## 검증 통과 (KOZON_PORT=7781·7782)

| 항목 | 결과 |
|---|---|
| 신택스 (4 신규 + server.js 패치) | ✅ PASS |
| `/api/health` | ✅ 200 |
| 트래버설 `../../etc/passwd` | ✅ `etc_passwd` 정규화 차단 |
| `/output/.../*.png` GET | ✅ 200, 1×1 PNG 정상 다운로드 |
| `/api/v07/inpaint/apply` 1×1 PNG | ✅ 200, 백업·교체 정상 |
| `/api/v07/generate-png` MCP 미연결 | ✅ slot:ok=false 명확한 메시지로 graceful |

## Why
- 사장님이 외부 도구(ChatGPT/Sora 등)와 도구를 왔다갔다하는 시간이 가장 큰 병목
- 이미지 슬롯만 자동 생성 → 외부 왕복 제거 + 디자인은 기존 HTML/CSS 시스템 그대로 유지 → 토큰 비용 최소, 결과물 일관성 최대
- 풀 페이지를 LLM이 디자인까지 박으면 멋있지만 매번 비용 ×5~10, 텍스트 수정 자유도 ×0

## How to apply
- v07.html은 plan을 기존 `/index.html`에서 받아 붙여넣는 보조 UI. 향후 기존 index.html의 Step 3에 자동 생성 버튼으로 통합 검토.
- **2026-05-27 미검증 단계**: 사장님 환경에서 v07.html 1차 테스트 필요 — Claude 위임 모드로 MCP/플러그인이 실제 호출되는지 확인. CLI 미설치 graceful 실패 검증은 통과.
- 디자인 작가는 Claude 유지(과연 결·11도메인 메모리·금칙어 학습), 이미지 픽셀만 Higgsfield. LLM-only로 카피·디자인 위탁 절대 금지.

## 다음 (사장님 결정 대기)
1. v07.html에서 첫 실 1슬롯 테스트 — 성공 시 본격 사용 + 사장님 environment에서 어느 경로(플러그인/MCP)로 호출됐는지 기록
2. `code/uploads/_last_prompt.txt` + `_last_output.txt` 캡처해서 디버깅 자료 보존
3. 안정화되면 기존 index.html Step 3에 통합 (별도 v07.html 폐지)

---

## 2026-06-02 — 메인 UI 통합 완료 (v0.7.2)

### 무엇이 바뀜
사장님 지시 — 메인 진입 화면(`상세페이지 제작기.html` → iframe → `code/public/index.html`)이 여전히 v0.5.6 "ChatGPT 영문 프롬프트 복사" 흐름이었음. 별도 `v07.html`을 폐지하지 않은 채 두면 정작 사장님이 사용하시는 UI에는 자동 생성이 없는 상태. 본 패치로 메인 UI를 v0.7 흐름으로 교체:

- **Step 2** "요청 프롬프트(ChatGPT 붙여넣기)" → **"이미지 슬롯 승인"** (✓/✗ 토글 + 모델·비율 셀렉트 + 일괄 승인 + "🎨 Higgsfield 일괄 생성" 버튼). 기존 영문 프롬프트 카드는 `<details>` fallback으로만 접어둠.
- **Step 3** "요청 이미지(드롭존)" → **"자동 생성 결과"** (진행 바 + 결과 카드 그리드 + hover overlay로 ✏️ 수정·⤴ 크게·🔄 재생성). 수동 업로드 드롭존은 `<details>` fallback.
- **Inpaint 모달** v07.html의 모달을 메인 페이지 하단에 그대로 이식. ESC/바깥 클릭/✕로 닫기, 드래그·Ctrl+V 받기, ⏮ 롤백 포함.
- **Step 4 자동 연결** — Higgsfield 생성 성공 시 클라가 `/output/{slug}/{slotId}.png`를 fetch → blob → dataUrl 변환해 `state.slotImages[req.slug]`에 자동 채움. 기존 `/api/generate` payload 그대로 동작 (image_slug 매칭).
- **호출 경로 fallback** — `code/config.json`에 `higgsfield_mode` 추가 (`"claude"` 기본 / `"cli"` / `"auto"`). v07-handlers.handleGeneratePng가 mode에 따라:
  - `claude`: `buildMcpGeneratePrompt` + `callClaude(cwd, prompt, j, { allowTools: true })` — Higgsfield 플러그인/MCP 위임. 사장님 PC 기본값.
  - `cli`: 기존 `higgsfieldCli.generateMany` (글로벌 CLI).
  - `auto`: CLI 먼저, 실패 시 Claude 폴백.

### 변경 파일
- `code/public/index.html` — Step 2/3 마크업 교체 + Inpaint 모달 추가
- `code/public/style.css` — `.approval-card`, `.approval-toolbar`, `.toggle-btn`, `.generation-status`, `.inpaint-modal*`, `.slot-card.is-generating/is-failed/is-success`, `.slot-card__overlay` 등 신규 클래스 추가
- `code/public/app.js` — `state.{slug, approvalSlots, currentInpaintSlot, generateJobId}` 추가, `buildApprovalSlotsFromPlan` / `renderApprovalGrid` / `renderResultGrid` / `callHiggsfieldGenerate` / `regenerateSingleSlot` / `handleGenerateResult` / `fetchPngAsDataUrl` / Inpaint 모달 4종 함수 + 이벤트 바인딩. 기존 `renderSlotCards`는 `renderManualSlotCards`로 개명되고 fallback 그리드(`#manual-slot-grid`)에 렌더.
- `code/config.json` — `higgsfield_mode: "claude"` 기본값
- `code/lib/v07-handlers.js` — `handleGeneratePng`에 mode 분기 + Claude 위임 경로 + auto 폴백 + 부정 키워드 자동 부착 분리

### 검증
- `node --check` PASS: server.js / v07-handlers.js / higgsfield-cli.js / section-prompts.js / inpaint-store.js / public/app.js
- `KOZON_PORT=7791 node server.js` 정상 부팅 (claude-cli 2.1.126 OK)
- `GET /api/health` → 200 OK
- `POST /api/v07/section-prompts` → slots 1개 정상 추출
- `POST /api/v07/generate-png` → job_id 즉시 반환 (202 Accepted)
- 메인 `index.html` 정적 서빙 → 새 마크업(`approval-grid`, `inpaint-modal`, `Higgsfield 일괄 생성`) 응답에 포함됨
- 사장님 실 UI 검증은 다음 세션에서 (자료 입력 → 기획 → 슬롯 ✓ → 일괄 생성 → 결과 → HTML 생성 시나리오)

### Why
- 백엔드(`/api/v07/*` 6개 엔드포인트)는 2026-05-27에 다 됐는데, 사장님이 보시는 메인 UI에 연결이 안 돼 정작 도구의 핵심 기능(자동 생성)이 사용 불가 상태였음
- 별도 `v07.html` 보조 UI는 plan JSON을 사람이 손으로 paste하는 형태 — 사장님이 실제 워크플로우에서 안 쓰심
- 메모리 끝에 "안정화되면 기존 index.html Step 3에 통합 (별도 v07.html 폐지)" 라고 적혀있던 미진행 단계를 이번에 클로즈

### How to apply
- `code/config.json`의 `higgsfield_mode`는 사장님 PC 기본 `"claude"`. 다른 사람 PC에 옮길 때 글로벌 `higgsfield` CLI가 설치돼 있다면 `"cli"` 또는 `"auto"`로 변경 가능
- 메인 UI 사용 흐름:
  1. Step 1 입력 (제품·기타 이미지 + 카피 + 스타일)
  2. ① 기획 + 이미지 프롬프트 생성 클릭 → plan 받음
  3. Step 2에서 슬롯 카드 ✓/✗, 모델/비율 조정
  4. 🎨 Higgsfield 일괄 생성 → Step 3로 자동 스크롤, 진행 바 표시
  5. 결과 PNG 미리보기 → 마음에 안 드는 컷은 ✏️ Inpaint(Higgsfield 새 탭) 또는 🔄 재생성
  6. ② 상세페이지 HTML 생성 → 자동 생성된 PNG가 state.slotImages에 채워져 있으므로 기존 흐름 그대로 동작
- v07.html은 호환을 위해 남겨두지만, 정식 사용 UI는 메인 index.html

### 미해결 / 다음
- v07.html은 폐지 예정이나 우선 호환 유지 — 다음 세션에서 사장님 확인 후 삭제
- 자동 생성 첫 실 슬롯 시간 측정 + 토큰/크레딧 소비 기록 (메모리에 추가)
- `higgsfield_mode: "claude"` 경로가 사장님 PC에서 실제로 슬롯 생성까지 도달하는지 1회 검증 필요

---

## 2026-06-02 (오후) — v0.7.3 사장님 신고 3건 + Codex 리뷰 디버깅

### 사장님 신고 3건
1. **디자인 스타일/레퍼런스/내용 스타일 select가 사라짐**
2. **우측 「내용 추출하기」가 "failed to fetch"**
3. **Higgsfield 연결 의문 — claude 모드 실제 동작 보장 없음**

### 1차 진단 결과
- 마크업·JS·서버 코드 모두 정상. 본 v0.7.2 패치는 부팅·응답에 회귀 만들지 않았음 (직접 `KOZON_PORT=7777 node server.js` 부팅 + `/api/health`·`/api/styles`·`/api/references`·`/api/extract` 200 OK 검증 완료)
- **진짜 원인 = 사장님 7777 서버가 꺼져 있었음**. 모든 fetch가 실패 → select 빈 채 표시 → 사장님 눈에는 "select가 사라진 듯" + "failed to fetch". UI가 서버 OFF 상태를 큰 글씨로 안내하지 못한 게 결정적 문제.
- `callClaude(options.allowTools)`는 `code/server.js:370`에서 이미 지원. v07-handlers의 `callClaude(cwd, prompt, j, { allowTools: true })` 호출 시그니처는 정확. 다만 allowTools=true가 `--tools ""` 차단 해제일 뿐 MCP/플러그인 강제 호출은 미보장 — 사전 점검 필요.

### Codex 리뷰 (codex:rescue 백그라운드 실행 결과)
- HIGH 1: v07-handlers/section-prompts/inpaint-store/higgsfield-cli 중 하나라도 require 실패하면 서버 전체 다운 → 메인 API까지 죽음
- HIGH 2: select는 서버 의존 초기화 — 미부팅 시 빈 박스
- MID 3: /api/extract 실패도 서버 미부팅이 원인 (라우트는 존재)
- MID 4: Claude 모드 MCP 강제 호출 미보장 — 사전 가용성 점검 권장
- LOW 5: Inpaint paste 전역 가로채기 위험 — capture/stopImmediatePropagation 부재

### v0.7.3 패치 (5건 모두 반영)

#### HIGH 1 — v07 mount try/catch 격리 (`code/server.js`)
- `require('./lib/v07-handlers')`를 try/catch로 감쌈. 실패 시 `V07_LOAD_ERROR` 보관.
- `const V07 = createV07Handlers(...)` 호출도 try/catch. 실패해도 메인 서버 listen 계속.
- 라우팅에 `if (pathname.startsWith('/api/v07/')) { if (!V07) return sendV07Unavailable(res); ... }` 가드 추가.
- `/api/health` 응답에 `v07: { ok: true|false, error }` 노출 — UI가 사장님께 정확히 안내 가능.
- 검증: `require.cache` 조작으로 section-prompts를 가짜 throw 모듈로 교체 후 서버 부팅 → 메인 부팅 정상.

#### HIGH 2 — 서버 OFF 사장님 친화 안내 (`code/public/index.html`·`style.css`·`app.js`)
- topbar 아래에 `#server-offline-banner` (네온 깜빡임 + ⚠ + "서버가 꺼져 있습니다 · 서버 재시작.bat 더블클릭" + 도메인 경로 자동 추정 + 「지금 다시 확인」 버튼)
- `setSelectsToOfflineState()` — pingServer 실패 시 select 4종(#style-select, #content-style-select, #reference-select, #ip-reference)에 disabled placeholder "⚠ 서버 OFF — 서버 재시작.bat 실행 후 새로고침"
- `pingServer`에 timeoutMs 4초 추가. 성공/실패 시 `markServerOnline()`·`markServerOffline()` 일관 호출. OFF→ON 전환 감지 시 styles/refs 자동 재로드.
- pingServer 간격 30초 → 8초로 단축 (사장님이 서버 띄우자마자 빠르게 감지)
- `/api/health` v07 비활성 응답을 받으면 토스트로 명확 안내 (단발성)

#### MID 4 — Higgsfield 가용성 사전 점검 (`code/lib/v07-handlers.js`·`config.json`)
- config에 `higgsfield_dry_check: true` 기본
- `runViaClaude` 진입 시 `probeHiggsfieldAvailable()` 짧은 호출:
  - prompt: "현재 세션에 mcp__higgsfield* 도구가 노출돼 있는지 한 줄 JSON으로 응답"
  - 응답 `{higgsfield_available:true|false, detected, reason}` 파싱
  - false면 즉시 `HIGGSFIELD_UNAVAILABLE` 에러로 throw → 11슬롯 비싸게 돌고 다 실패하는 사고 차단
  - 에러 메시지에 "claude.ai에서 Higgsfield 플러그인 추가 또는 `claude mcp add`로 mcp.higgsfield.ai 연결 후 서버 재시작" 해결 안내

#### LOW 5 — Inpaint paste 전역 가로채기 방지 (`code/public/app.js`)
- setupInpaintModal의 paste 리스너를 capture 단계로 등록 (`addEventListener('paste', ..., true)`)
- 모달 열림 + 이미지 paste 감지 시 `preventDefault()` + `stopPropagation()` + `stopImmediatePropagation()` 3중 차단
- setupPaste 글로벌 핸들러에도 모달 열림 가드 추가 (안전망)

#### 추가 — 진입점 fallback (`상세페이지 제작기.html`)
- 더블클릭 진입 즉시 `fetch http://127.0.0.1:7777/api/health` probe (타임아웃 1.5초)
- 성공: iframe `./code/public/index.html` 로드
- 실패: 큰 안내 화면 (⚠ + "서버가 꺼져 있습니다" + 도메인 폴더 경로 자동 표시 + 3단계 가이드 + 「지금 다시 확인」 버튼 + 3초마다 자동 재시도)
- 서버 살아나면 자동으로 본 UI로 전환 (사장님 추가 조작 0)

### 검증
- `node -c` 전 모듈 PASS (server.js, v07-handlers.js, higgsfield-cli.js, section-prompts.js, inpaint-store.js, public/app.js)
- `KOZON_PORT=7777 node server.js` 정상 부팅 (claude-cli 2.1.126)
- `/api/health` 응답: `higgsfield_mode: "claude"`, `v07: {ok:true, error:null}` 노출 확인
- `/api/styles` 4×4 스타일, `/api/references`, `/api/extract` (job_id 발급) 모두 200 OK
- v07 강제 비활성 시나리오 (section-prompts 가짜 교체) → 메인 서버 정상 부팅 확인 (격리 PASS)
- 서버 버전 자동 갱신 확인 (v0.5.5+5f795ff → v0.5.5+다음커밋해시)

### 알려진 남은 부분
- 사장님 PC에서 메인 UI 실 부팅 시 select가 채워지는지 시각 검증 — 사장님 1회 확인 필요
- Higgsfield "claude" 모드 dry-check가 통과하는지 — 사장님 PC에서 슬롯 1개로 generate-png 호출해 확인 필요 (실패 시 친화 에러 메시지가 노출되는지)
- 진입점 fallback이 OFF→ON 전환 시 자동으로 본 UI로 넘어가는지

---

## 2026-06-03 — v0.7.4 원클릭 진입점 (.cmd) + 사장님 신고 후속

### 사장님 신고
"서버 재시작.bat 더블클릭 안내 화면이 매번 뜨는 게 짜증" — v0.7.3 fallback 화면은 정상 동작 중이었으나, 사장님이 매번 "서버 재시작.bat 더블클릭" 단계를 수행해야 하는 게 번거로움.

### 진단
- 사장님 PC 7777 포트에 서버가 실제로 안 떠 있던 상태 (직접 `curl --max-time 2 http://127.0.0.1:7777/api/health` 타임아웃 + powershell `Get-NetTCPConnection -LocalPort 7777` 결과 없음으로 확인)
- 즉 v0.7.3 fallback이 의도대로 동작 중. 문제는 **사장님이 매번 .bat을 직접 더블클릭해야 한다는 운영 UX**.
- `상세페이지 제작기.html` 진입점이 서버를 직접 띄울 수 없음 (브라우저 보안 제약). 별도 진입점 필요.

### v0.7.4 패치

#### 신규: `상세페이지 제작기.cmd` (원클릭 진입점)
- 사장님 더블클릭 1회로 (1) 서버 health probe (curl --max-time 2) (2) OFF면 `wscript "code\start_hidden.vbs"` 호출해 hidden 서버 부팅 (3) 최대 25초 폴링 (4) 살아나면 `start "" "상세페이지 제작기.html"`로 기본 브라우저 자동 열기 (5) 타임아웃 시 `choice` 명령으로 진단 메시지 + 「서버 재시작.bat 자동 실행할까요?」 Y/N
- **인코딩**: cp949 (Windows 한국어 cmd 기본). UTF-8 BOM 시도했으나 BOM 첫 3바이트가 `@echo off`를 깨뜨려 실패. UTF-16 LE BOM은 vbs 인코딩 지옥 경험 후 포기.
- **의존 도구**: curl(W10 1803+ 기본), wscript(System32), choice(System32), ping. 모두 Windows 10+ 기본 제공 확인.
- vbs 시도 → linter가 string 내용 손대 한글 깨짐 + UTF-16 LE BOM 인식 일관성 부족 → 폐기. cmd가 훨씬 안정.

#### `상세페이지 제작기.html` fallback 화면 보강
- 안내 박스에 "💡 앞으로는 `상세페이지 제작기.cmd` 더블클릭하세요" 명시 박스 (네온 시안 강조)
- steps 1번에 .cmd를 권장 진입점으로, .bat/.vbs를 대안으로 표기

#### `README.md` 갱신
- "🖱️ 더블클릭 실행 (권장)" 섹션을 .cmd 안내로 교체. .html/.bat은 대안으로.

### 검증
- `.cmd` 신택스 검증: cmd.exe로 직접 호출 시 `@echo off` 정상 적용, 헤더·핵심 파일 존재 확인 로직까지 정상 흐름 (sandbox 한계로 wscript 부팅 자체는 검증 불가, 사장님 PC에서 1회 확인 필요)
- `cmd.exe //c "where curl & where wscript & where choice"` 모두 `C:\Windows\System32`에 존재 확인
- `상세페이지 제작기.cmd` 파일 인코딩: `ISO-8859 (cp949), CRLF line terminators` — Windows cmd 네이티브
- 핵심 파일 4종 (.cmd, .html, .bat, .vbs) 모두 정상 존재

### Why
사장님이 매번 별도 .bat을 클릭해야 하는 것 자체가 v0.7.3의 미진행 단계였음. 진입점 한 곳으로 통합해 사장님 조작 1회로 끝.

### How to apply
- 사장님 새 흐름: **`상세페이지 제작기.cmd` 더블클릭 → 1-2초 콘솔 깜빡 → 브라우저 자동 열림**
- 트러블슈팅: 25초 후에도 안 뜨면 친화 진단 메시지 (Node 미설치/node_modules 누락/포트 점유/server.js 부팅 에러) + 「서버 재시작.bat 자동 실행 Y/N」 prompt
- GitHub repo 배포 시 다른 사람 PC도 동일하게 동작 (이전에 사장님이 요청하신 "초기 1회 셋업 후 원클릭" 흐름의 핵심)

---

## 2026-06-03 (오후) — v0.7.5 .cmd 폐기 + 시작 프로그램 등록 구조

### 사장님 지시
"cmd 더블클릭 구조는 싫어. 그냥 기존부터 서버가 떠 있는 구조로 가자."

### 진단
- 사장님 PC startup 폴더(`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`)에 **이미 `KOZON Detail Page Maker.lnk` 단축키가 등록돼 있음**. PowerShell COM으로 TargetPath 확인: `wscript.exe + start_hidden.vbs` 정상.
- 즉 시작 프로그램 메커니즘은 살아있었음. 7777이 안 떠있던 이유는:
  1. 노트북 sleep/wakeup으로 startup 미실행
  2. 또는 startup 후 server.js가 어떤 이유로 죽음
  3. 또는 사장님이 직접 node.exe kill

### v0.7.5 패치
1. **`상세페이지 제작기.cmd` 제거** (사장님 거부)
2. **`서버 자동시작 등록.bat` 신규** — 시작 프로그램 등록 + 진단 일체화. 흐름:
   - 이미 등록돼 있으면 → "OK 이미 등록" + 7777 health 확인 → 살아있으면 "그냥 .html 더블클릭", 죽어있으면 "지금 부팅 Y/N"
   - 미등록이면 → PowerShell `WScript.Shell.CreateShortcut`으로 .lnk 생성 + "지금 부팅 Y/N"
   - 모든 분기에 친화 진단 메시지 (sleep/wakeup·포트 점유·server.js 에러)
3. **`서버 자동시작 해제.bat` 신규** — 등록 시 단축키(구·신 이름 모두) 안전 삭제
4. **`상세페이지 제작기.html` fallback 안내** — `서버 자동시작 등록.bat` 1회 더블클릭 권장으로 변경
5. **`README.md`** — "🖱️ 평생 자동 - 시작 프로그램 1회 등록 (권장)" 섹션으로 갱신
6. **cp949 인코딩**으로 .bat 저장 (em-dash·화살표·이모지는 ASCII 대체로 치환)
7. **즉시 조치**: `node server.js`로 사장님 PC에 7777 서버 부팅 → 본 UI 즉시 사용 가능

### 사장님 흐름 (확정)
1. (최초 1회) `서버 자동시작 등록.bat` 더블클릭 → 시작 프로그램 등록
2. (이후 평생) PC 켤 때마다 서버 자동 부팅
3. (사용) `상세페이지 제작기.html` 더블클릭 → 본 UI 즉시 진입

### 만약 노트북 sleep 후 서버가 죽었을 때
- 사장님이 `상세페이지 제작기.html` 더블클릭 → v0.7.3 fallback 화면 자동 표시 → 「서버 자동시작 등록.bat」 안내 (사장님이 그것 더블클릭하면 자동 진단·부팅) → 또는 단축키를 직접 한 번 더 실행(`%APPDATA%\...\Startup` 폴더의 lnk 더블클릭) → 자동 재시도가 OFF→ON 감지

### 다음 결정 필요
- sleep/wakeup 후에도 서버 떠 있도록 하려면 → node를 Windows 서비스화 (NSSM 등). 단 추가 도구 + admin 권한. 사장님 친화 vs 견고함 trade-off.
- 또는 server.js 부팅 시 어떤 에러로 죽는지 1회 진단해 root cause 잡기 (사장님 PC에서 `서버 재시작.bat` 더블클릭 후 콘솔 에러 메시지 캡처)

---

## 2026-06-03 (저녁) — v0.7.6 Step 2 unlock 잠금 버그

### 사장님 신고
"① 기획 + 이미지 프롬프트 생성 버튼 눌러도 Step 2 영역 만질 수 없게 잠긴 채로 머무름."

### 진단 (1차 — 자체 + codex 병렬)
- 서버 상태: `running=0, done=2, cancelled=2`. 즉 plan job은 완료됐는데 클라이언트가 Step 2 unlock 못 함.
- **진짜 원인 (HIGH)**: `code/public/app.js` `renderPlanCards()` line 660이 `const toolbar = $('#prompt-toolbar')` 후 `toolbar.hidden = ...`에 무방비 접근. v0.7.2 마크업 교체 시 `#prompt-toolbar` id가 제거되어 (fallback details 안의 `.result-toolbar`로 대체) `toolbar`가 null → `Cannot set property 'hidden' of null` throw → callPlan의 catch 발동 → `showStep(2, 'unlock')` 호출 누락 → Step 2가 `data-locked="true"` 그대로 유지 → CSS `opacity:.35; pointer-events:none`으로 사장님이 만질 수 없는 상태.

### v0.7.6 패치
1. **renderPlanCards null-safe** — `toolbar` / `summaryEl` / `cards`가 없으면 안전 early return 또는 옵셔널 set. `plan?.summary` 옵셔널 체이닝.
2. **callPlan 흐름 재배치** — `showStep(1,'done'); showStep(2,'unlock'); ...`을 응답 직후 가장 먼저 호출. 그 다음 `state.slug/approvalSlots/renderApprovalGrid/renderPlanCards/renderManualSlotCards`를 각각 try/catch로 격리. 한 함수에서 throw해도 다른 단계는 진행되고 Step 2는 항상 unlock 유지.
3. **에러 로깅 보강** — 각 렌더 단계에 `console.error('[plan] xxx 실패:', e)`. 사장님이 F12로 어디서 깨졌는지 즉시 보임.
4. **서버 재기동 확인**: `v0.5.5+b9f8537`로 7777 재부팅. 사장님은 Ctrl+F5로 새 app.js 받으면 됨.

### 검증
- `node --check public/app.js` PASS
- `/api/health` 200 OK
- 핵심: 사장님 PC 브라우저에서 Ctrl+F5 후 ① 기획 + 이미지 프롬프트 생성 → Step 2 unlock 즉시, 슬롯 카드가 만져지는지 1회 확인 필요

### 회귀 방어 메모
- v0.7.2 마크업 교체 시 누락한 selector가 또 있을 수 있음. 추후 패치에서 selector 변경 시 모든 함수에서 `$('#x')` 호출 후 무방비 접근 금지 — 반드시 null check.
- callPlan/callGenerate/callDirectGenerate 같은 비동기 핸들러는 "응답 받음" 직후 unlock부터 호출 + 렌더는 격리.

### Codex 동시 진단 결과 (codex:rescue 백그라운드)
- "현재 디스크 코드는 의심한 버그(unlock 순서) 없음 — 이미 패치됨"
- "진짜 원인은 브라우저 캐시. Ctrl+Shift+R 강제 새로고침 필요"
- 즉 본 패치(unlock 재배치 + null-safe)와 별개로 **캐시 무효화 인프라**가 필요. → v0.7.7로 이어짐.

---

## 2026-06-03 (저녁) — v0.7.7 캐시 무효화 (Ctrl+F5 불필요)

### Why
사장님 PC가 `상세페이지 제작기.html`을 file://로 열고, iframe src도 `./code/public/index.html` 상대경로(=file://)로 로드 → 서버를 거치지 않으므로 서버의 `Cache-Control: no-store` 헤더 효과 없음. 사장님이 패치마다 Ctrl+F5 눌러야 새 app.js 받음.

### v0.7.7 패치
1. **iframe src를 서버 origin으로 변경** (`상세페이지 제작기.html`):
   - `'./code/public/index.html'` (file://) → `SERVER_URL + '/index.html'` (http://127.0.0.1:7777/index.html)
   - 서버 통과 → `Cache-Control: no-store` 적용 → 매번 새 코드 자동 fetch
2. **index.html에서 app.js 로드 시 ?v= 쿼리 부착**:
   - `<script src="./app.js"></script>` → 동적 생성 `<script src="./app.js?v=Date.now()">`
   - 매 요청마다 다른 v → 브라우저가 같은 URL로 캐싱 못 함 (이중 안전망)
3. 서버 정적 서빙은 이미 `Cache-Control: no-store` 설정돼 있음 (server.js:1490) — 변경 불필요. iframe origin 전환만으로 효과 발휘.

### 검증
- `curl -I http://127.0.0.1:7777/app.js` → `Cache-Control: no-store` 응답 확인
- `curl http://127.0.0.1:7777/index.html` → 새 마크업 키워드(approval-grid, inpaint-modal 등) 15회 매치
- 사장님 흐름: `상세페이지 제작기.html` 더블클릭 → iframe이 서버 origin 호출 → 매번 최신 코드 + 그 안의 app.js도 매번 새 ?v= 쿼리로 fetch

### How to apply
- 사장님은 한 번 `상세페이지 제작기.html` 더블클릭으로 새 진입점 로드 (캐시 무효화 인프라 적용)
- 그 후 본 도구가 패치될 때마다 자동으로 새 코드를 받음 — Ctrl+F5 불필요
- 단 `상세페이지 제작기.html` 자체가 변경된 경우 1회만 Ctrl+F5 필요 (또는 다시 더블클릭)

---

## 2026-06-03 (밤) — v0.7.8 iframe 폐기 + 자체 redirect (drag-drop 복원)

### 사장님 신고
"드래그 앤 드롭 기능이 안 됨."

### 진단
- v0.7.7에서 `상세페이지 제작기.html` iframe src를 `./code/public/index.html`(file://)에서 `http://127.0.0.1:7777/index.html`로 변경 → **file:// 부모 + http:// 자식 iframe cross-origin 상황** 발생
- 일부 브라우저는 cross-origin iframe content로 OS drag 이벤트 전달에 제약을 둠 → 사장님이 OS 탐색기에서 파일 드래그 → iframe 안 dropzone에 드롭해도 dragover/drop 이벤트가 안 잡힘
- v0.7.6에서 추가한 캐시 무효화 ?v=Date.now() 부착은 정상 — 단 cross-origin 부작용을 해결 못 함

### v0.7.8 패치
**iframe 자체 폐기 + 자체 redirect 패턴**:
- `상세페이지 제작기.html` 더블클릭 → file:// 컨텍스트에서 health probe (1.5초 timeout)
- 서버 OK → `window.location.replace('http://127.0.0.1:7777/index.html')` → 페이지 자체가 http:// 로 이동
- 서버 OFF → 현재 file:// 페이지에 fallback 안내 표시 + 3초마다 자동 재시도
- 일단 redirect되면 모든 게 동일 origin (http://127.0.0.1:7777) → drag-drop · clipboard · 캐시 무효화 · 모든 기능 정상

### 진입 흐름 (확정)
1. 사장님 `상세페이지 제작기.html` 더블클릭 (file://)
2. 진입 즉시 spinner + "서버 연결 확인 중…"
3. health probe 성공 → `window.location.replace`로 http://127.0.0.1:7777/index.html 이동 (히스토리에 file:// 남기지 않음)
4. 동일 origin 상황 → 사장님이 OS 탐색기에서 이미지 드래그 → dropzone-product/reference에 정상 드롭
5. 모든 fetch가 서버 origin → `Cache-Control: no-store` 적용 → Ctrl+F5 불필요

### 검증
- `상세페이지 제작기.html` 내부 redirect 키워드(`window.location.replace`, `TARGET_URL`, `redirected`) 정상 존재
- `curl http://127.0.0.1:7777/index.html` 200 OK 응답 확인
- 사장님 검증: 더블클릭 → 자동 이동 → URL bar가 `http://127.0.0.1:7777/index.html` 표시 → drag-drop 정상

### 미해결 / 다음
- 사장님이 `상세페이지 제작기.html`을 평소 더블클릭으로 진입 시 옛 브라우저 캐시가 옛 iframe 버전을 서빙할 수 있음 → **이번 1회만 Ctrl+F5 강제 새로고침 필요**
- 그 다음부터는 file://의 캐시가 무효화돼도 어차피 즉시 redirect되므로 자연 해결

---

## 2026-06-03 (밤늦게) — v0.7.9 init() 미호출 root cause (drag-drop + select 동시 fail)

### 사장님 신고
"드래그앤드롭 안 되고 + 디자인/레퍼런스/내용 스타일 select 옵션도 안 뜸"

### 진단 — 진짜 root cause
v0.7.6 패치에서 캐시 무효화를 위해 `code/public/index.html`의 `<script src="./app.js"></script>`를 **동적 createElement + appendChild** 패턴으로 변경:
```js
var s = document.createElement('script');
s.src = './app.js?v=' + v;
document.body.appendChild(s);
```

이 동적 추가 패턴의 **부작용**: 동적으로 추가된 script는 브라우저 기본 동작상 async로 처리되어 **DOMContentLoaded 이벤트 후에 실행될 가능성**. 그러면 app.js 끝의 `document.addEventListener('DOMContentLoaded', init)`가 **이미 지나간 이벤트에 등록되어 init() 함수가 절대 호출 안 됨** → `setupDropzone`/`setupPaste`/`bindEvents`/`setupInpaintModal`/`loadStyles`/`loadReferences` 모두 미실행 → drag-drop 핸들러 미등록 + select 빈 채로 머무름 + 모든 버튼 이벤트 미바인딩.

**사장님 신고 두 가지가 한 화면에서 동시 발생하는 정확한 시나리오와 일치** — 다른 모든 가설(cross-origin, 브라우저 캐시, 마크업 변경 등)은 한 쪽만 설명 가능했지만 이 root cause는 두 가지 모두 자연 설명.

### v0.7.9 패치
`code/public/app.js` 끝 부분:
```js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  Promise.resolve().then(init);   // 이미 로드됨 — 즉시 호출
}
```

`readyState` 분기로 DOM 로드 상태에 무관하게 init() 호출 보장. microtask(`Promise.resolve().then`)로 한 단계 미뤄 동일 turn의 다른 inline script들이 끝나길 보장.

### 추가 보강
- `상세페이지 제작기.html`에 **build 식별자** `v0.7.9 · 2026-06-03 22:30` 하단 우측 작게 표시 — 사장님이 화면에서 즉시 어느 버전을 보는지 확인 가능 (옛 캐시면 옛 식별자, 새 코드면 새 식별자)
- `<meta http-equiv="refresh" content="2; url=http://127.0.0.1:7777/index.html">` 백업 redirect — JS 비활성 또는 throw 시 자동 작동
- 강력 캐시 무력화 meta(`Cache-Control no-cache, no-store, must-revalidate` + `Pragma no-cache` + `Expires 0`)

### 검증
- `node --check app.js` PASS
- `curl http://127.0.0.1:7777/app.js | tail` → readyState 분기 코드 정상 응답 확인
- 사장님 검증 필요: Ctrl+Shift+R 강제 새로고침 후 (1) build-tag가 `v0.7.9`로 보이는지 (2) 좌측 dropzone에 이미지 드래그 → 정상 드롭 (3) select 옵션 정상 표시 (4) 「기획 + 이미지 프롬프트 생성」 → Step 2 unlock 정상

### Why v0.7.6 패치가 root cause
- v0.7.6 패치 의도: "사장님이 패치마다 Ctrl+F5 안 누르도록 동적 script 로드로 ?v= 쿼리 부착해 캐시 무효화"
- 부작용: 동적 script 실행 타이밍 race → DOMContentLoaded 누락 → 전체 init() 안 됨
- 본 패치(readyState 분기)로 부작용만 해결, 캐시 무효화 효과는 유지

### 회귀 방어 메모
- DOM 이벤트 핸들러 등록 시 항상 readyState 확인 패턴 사용
- 동적 script 로드는 timing race를 만든다는 것 기억할 것

### v0.7.9b — codex 추가 진단 반영 (init 내부 격리 + null guard)

Codex가 별도로 잡은 HIGH 3건:
1. `init()` 내 setup 호출이 try/catch 없이 순차 → 한 함수 throw하면 loadStyles 미실행 (readyState 패치는 init 호출 보장만 함, 내부 throw는 별개)
2. `setupDropzone()` zone/input null check 없음 → 옛 캐시 HTML 시 throw
3. `bindEvents()` 다수 셀렉터 무방비 접근 → 캐시 구버전 DOM과 불일치 시 throw

추가 패치 (`code/public/app.js`):
- **setupDropzone**: 시작부에 `if (!zone || !input) { console.warn; return; }` null guard
- **bindEvents**: 모든 `$('#xxx').addEventListener` 호출을 `?.addEventListener`로 옵셔널 체이닝
- **init**: `safeRun(label, fn)` 헬퍼로 각 setup을 try/catch 격리. setup* 실패해도 pingServer/loadStyles/loadReferences 무조건 실행.

검증: `node --check` PASS. 서버 통과 응답에 safeRun 키워드 정상 포함.

이 패치로 어떤 setup이 throw해도 다른 setup은 동작 + select 로딩 보장 → 사장님 신고 시나리오 두 가지가 또 동시 발생하는 케이스 차단.

---

## 2026-06-03 (자정) — v0.7.10 Higgsfield permission denied + 사장님 사진 활용 사슬

### 사장님 신고 2건
1. **Higgsfield 호출 결과 실패** — `permission denied: mcp__claude_ai_higgsfield_ai__generate_image not granted`
2. **사장님 제공 사진을 활용 안 함** — "내가 제공한 제품 사진 등 사진들은 쓰고, 그걸 기반으로 상세페이지 만들어야지"

### 진단

**신고 1 (permission denied)**:
- claude CLI가 도구(mcp__) 호출 시마다 권한 confirmation을 요구. 비대화형 spawn 컨텍스트에서 응답 불가 → 거부.
- v0.7 패치 시 `--tools ""` 차단 해제만 추가했고 권한 모드는 default 유지 → confirmation 단계에서 막힘.
- claude CLI 옵션 `--permission-mode bypassPermissions` 또는 `--dangerously-skip-permissions` 사용 필요.

**신고 2 (사장님 사진 미활용)** — 정보 누락 사슬 발견:
1. `/api/plan` 응답: Claude가 `plan.image_requests[].attach_image_path`에 사장님 사진 경로 매핑 ✓
2. 클라 `buildApprovalSlotsFromPlan`: slot에 attach_image_path/prompt_mode 누락 ✗
3. 클라 `callHiggsfieldGenerate` POST /api/v07/generate-png: payload에 attach 정보 미포함 ✗
4. 서버 `handleGeneratePng` cleanSlots: attach 정보 보존 안 함 ✗
5. `buildMcpGeneratePrompt`: prompt JSON에 attach_image_path/prompt_mode 노출 안 함 ✗
6. Claude/Higgsfield: 사장님 사진을 모르고 텍스트 prompt만으로 새 이미지 생성 ✗

전 사슬에서 attach 정보가 사라져 사장님 제품과 무관한 이미지만 생성됨.

### v0.7.10 패치

**A. permission 우회** (`code/server.js` callClaude):
- `allowTools:true` 분기에서 `--tools` 제거 + `--permission-mode bypassPermissions` 명시 추가.
- 사장님 PC 로컬 spawn + 사장님 prompt만 실행하므로 안전 (bypassPermissions는 사용자 PC 내부 도구 호출 권한만 우회).

**B. 사장님 사진 활용 전 사슬 복원**:
1. `code/public/app.js` `buildApprovalSlotsFromPlan`: slot에 `promptMode`, `attachImagePath` 필드 추가.
2. `code/public/app.js` `callHiggsfieldGenerate`/`regenerateSingleSlot`: POST payload slot에 두 필드 포함.
3. `code/lib/v07-handlers.js` `handleGeneratePng`: cleanSlots에 path traversal 방어(`..` 차단, 길이 500자 제한) 후 보존.
4. `code/lib/v07-handlers.js` `buildMcpGeneratePrompt`: 슬롯 JSON에 `prompt_mode`, `attach_image_path` 노출 + Claude에게 명시 지시:
   - "attach_image_path가 있으면 그 사진을 Higgsfield MCP generate_image의 image input 파라미터로 첨부하세요"
   - "product_based → 제품 그대로 유지 + 배경/씬만 변경. 모양·색상·로고 재해석 금지"
   - "reference_based → visual base로 사용 + 보완/변형"
   - "new_image 또는 빈 경우 → 처음부터 생성"
5. 응답 형식에 `used_attached:<bool>` 필드 추가 — 실제로 첨부 사용 여부 회신.

### 검증
- `node --check` 전 모듈 PASS (server.js, v07-handlers.js, public/app.js)
- KOZON_PORT=7777 부팅 OK, `/api/health` v07:ok, version `v0.5.5+584c20e`
- 사장님 검증 필요:
  1. Ctrl+Shift+R 강제 새로고침
  2. 사진 첨부 + 카피 입력 → ① 기획 + 이미지 프롬프트 생성
  3. Step 2 슬롯 카드에 사장님 제품 사진과 연결된 슬롯 보임 (plan에 attach_image_path가 있으면)
  4. 🎨 Higgsfield 일괄 생성 → permission denied 없이 진행 + 결과 PNG가 사장님 제품 형태를 그대로 유지하는지 확인
  5. F12 콘솔 또는 서버 로그에서 `used_attached:true`/`false` 회신 확인

### 보안 메모
- `--permission-mode bypassPermissions`는 도구 호출 confirmation만 우회. 사장님 PC 외부 접근 권한 추가 안 함.
- attachImagePath path traversal 방어: `..` 패턴 차단 + 500자 제한. 진짜 강한 격리는 실제 파일 사용 시점에 fs.realpath + UPLOADS_DIR.startsWith 검증 (다음 패치 후보).
