---
name: v0.9 — ChatGPT(조) 자동 통합 완성
description: 「① 기획」 한 번으로 plan → ChatGPT(조) 진입 → 기존 대화 재활용 → 사장님 사진 첨부 → 결과 다운로드 → 슬롯 자동 채움까지 풀 자동. 2026-06-13 Phase E 8차 시도 447초 풀 플로우 성공 + 커밋 591818c
type: project
---

# v0.9 — ChatGPT(조) 자동 통합 완성 (2026-06-13)

## 결과 한 줄
**「① 기획」 한 번 클릭으로 plan → ChatGPT 진입(펼침 + 더 보기) → 4탭 병렬 + 사장님 제품 사진 자동 첨부 → 결과 PNG 자동 다운로드 → Step 3 슬롯 자동 채움**까지 전 자동. Phase E 자동 테스트 447초 풀 플로우 성공 (커밋 591818c).

## 사장님 새 흐름
1. Step 1 — 제품 사진 + 카피 + 스타일 입력
2. **「① 기획」 클릭** → plan API → 영문 프롬프트 N개 + 슬롯 카드 N개 노출 → **자동으로 ChatGPT(조) 자동 생성 시작** (hint 약속 일관성)
3. 서버가 Playwright로 Chromium 띄움 → ChatGPT(조) 진입 → 사이드바 펼침 + "더 보기" 자동 클릭 → 기존 대화 N개 URL 수집
4. N개 탭이 각자 conversation URL로 직접 navigate (새 대화 생성 X — rate-limit 회피)
5. stagger 5초로 각 탭에 프롬프트 발사. 사장님 사진은 plan의 `prompt_mode === product_based|reference_based` + `attach_image_path` 그대로 input[type=file] 자동 첨부
6. ChatGPT 응답 끝까지 대기(stop 버튼 사라질 때) + "새로 등장한" estuary 이미지만 다운로드
7. 결과 PNG 9장이 `/generated/parallel_<ts>/01~09.png` 자동 정리 → 클라가 fetch → File 객체 → assignSlot 자동 채움
8. 사장님이 결과 보고 「② HTML 생성」 클릭(autoChain=false). 마음에 안 드는 슬롯은 카드 「↻ 다시 만들기」로 단일 재생성

## 신규 자산

### code/lib/chatgpt-image.mjs (신설, 약 850줄)
Playwright persistent context 자동화 본체. 핵심 함수:

| 함수 | 역할 |
|---|---|
| `generateImage({ prompt, count })` | 단일 슬롯 1장 (v0.9 PoC 1차) |
| `generateImagesInProjectParallel({ projectName, prompts, staggerMs, perTabTimeoutMs })` | N탭 병렬 본 함수. prompts 형식 `Array<string \| { prompt, attachPath? }>` |
| `enterProject(page, projectName)` | role=button + aria-expanded + textContent 정확 매치 row 찾고 펼침 (click/Enter/mouse 좌표 4중 폴백) |
| `findConversationUrls(page, projectName, count)` | 기존 대화 N개 URL 수집. polling + 사이드바 스크롤 + "더 보기" 자동 클릭 (ps-9 들여쓰기 button만) |
| `attachImageToInput(page, attachPath, tabIdx)` | input[type=file] setInputFiles + 미리보기 thumbnail 가시화 폴링 10초 |
| `submitPromptOnPage(page, item, tabIdx)` | 모달 dismiss → 첨부 → 입력박스 입력 → 제출 직전 estuary src Set 캡처 후 반환 → Enter |
| `captureExistingImageUrls(page)` | 페이지 안 모든 estuary/oaiusercontent 이미지 src를 Set으로 캡처 (옛 이미지 무시용) |
| `isStillGenerating(page)` | "정지" 버튼 보이는 동안 응답 진행 중으로 판단 |
| `waitAndDownloadOnPage(page, tabIdx, dest, timeout, beforeUrls)` | beforeUrls에 없는 새 src + 생성 끝났을 때만 다운로드 |
| `dismissBlockingModals(page, tabIdx)` | rate-limit/한도 모달 testid 한정 4종 + 텍스트 매치 폴백 (정상 다이얼로그 보호) |
| `dumpDiagnostic(page, tag)` | 실패 시 진단 PNG + HTML 자동 저장 |

### code/server.js (확장)
- `CHATGPT_JOBS` Map + `pruneChatgptJobs()` (TTL 24h + 50개 cap)
- `createChatgptJob` / `createChatgptParallelJob` / `runChatgptJob` / `runChatgptParallelJob`
- **잡 직렬화 큐 `_chatgptChainTail`** — chatgpt-profile SingletonLock 충돌 영구 차단
- 라우트:
  - `POST /api/images/chatgpt/generate-parallel` — prompts (string 또는 객체) + projectName + stagger + perTabTimeout. attachPath UPLOADS_DIR/GENERATED_DIR_SRV isInside + realpathSync.native() 2중 검증
  - `GET /api/images/chatgpt/jobs/:id` — parallel 필드 노출 + files 절대경로를 `/generated/` 상대 URL로 변환
  - `GET /generated/*` — 이미지 allowlist + realpathSync 보강 (symlink escape 차단)

### code/public/app.js (확장)
- `autoGenerateViaChatGPT({ autoChain })` — plan image_requests의 `prompt_mode` + `attach_image_path` 그대로 prompts 객체 배열로 서버 전송. 폴링 → urls fetch → File → assignSlot
- `callPlan()` 끝에서 자동 호출 (autoChain: false, hint 약속 일관성)
- `regenerateSingleSlot(slug)` — 단일 슬롯 재생성 + `_regenInflight` Set 가드
- `assignSlot` — 「↻ 다시 만들기」 자동 노출

### 슬롯 카드 UI (index.html + style.css)
- `<button class="slot-card__regen">↻ 다시 만들기</button>` (이미지 채워졌을 때만)
- `<div class="slot-card__status">` (진행 상태)

### 테스트 스크립트
- `code/scripts/test_chatgpt_image.mjs` — 단일 PoC (사과 1장, 57초)
- `code/scripts/test_chatgpt_4parallel.mjs` — 4탭 병렬 PoC (사과 4컷, 86초)
- `code/scripts/test_ui_full_flow.mjs` — Phase E 도구 UI 통째 자동 테스트

## 결정적 발견 + 해결 (사장님이 짚어주신 것)

### 사장님 지시 ① — "새 대화 자꾸 열지 말고 기존 대화 4개 동시 활용"
- 원인: 매 탭이 새 채팅 생성 → ChatGPT가 짧은 시간 다수 대화 만들면 `modal-conversation-history-rate-limit` 모달 띄움
- 해결: `findConversationUrls`로 기존 대화 URL 수집 → 각 탭이 그 URL로 직접 navigate

### 사장님 지시 ② — "내가 제공한 hero 이미지를 GPT에 레퍼런스로 제출"
- 원인: 자동화 흐름이 텍스트 프롬프트만 보내고 이미지 첨부 안 함
- 해결: plan은 이미 `prompt_mode`(`product_based`/`reference_based`) + `attach_image_path` 결정 → autoGenerateViaChatGPT가 그대로 prompts에 담아 서버 전송 → `attachImageToInput`이 input[type=file] setInputFiles

### 사장님 지시 ③ — "옛 이미지 다운로드 X. 새로 생성된 이미지만"
- 원인: `waitAndDownloadOnPage`가 페이지 첫 estuary img를 잡음 → 그게 그 대화 옛 응답 이미지
- 해결: 제출 직전 `captureExistingImageUrls`로 옛 src Set 캡처 → 제출 후 `beforeUrls`에 없는 + `isStillGenerating()`가 false (정지 버튼 사라짐)일 때만 다운로드

### 사이드바 펼침 자동화 (가장 오래 걸린 디버깅)
- 1~4차 시도 실패 — 이유는 매번 달랐음 (chatgpt-profile 빔 / 모달 차단 / SPA URL 안 바뀜 / textContent 매치 시 「고정됨」 헤더 자식 텍스트 합쳐서 잘못 잡힘)
- 6차 진전: 정확 매치 row 찾고 4중 펼침 폴백 → 5/9 conversation 잡힘
- 8차 성공: 사이드바 "더 보기" 버튼 자동 클릭 추가 → 9/9 매치

## 12건 패치 누적 (Codex 5 + 추가 7)
- P0 serveGenerated realpathSync.native() + isInside 재확인 (server.js L1627-1635)
- P1a pruneChatgptJobs TTL+상한 (server.js L25-46)
- P1b 사이드바 컨테이너 스코프 (chatgpt-image.mjs L304)
- P2a findInputBox 진단 dump (chatgpt-image.mjs L101-110)
- P2b callGenerate 직전 microtask flush (app.js L920)
- B 잡 직렬화 큐 (server.js _chatgptChainTail)
- B regenerateSingleSlot inflight 가드 (app.js _regenInflight Set)
- C findConversationUrls polling 8초 + 스크롤 + "더 보기" 클릭
- C dismissBlockingModals testid 한정 + 텍스트 매치 폴백
- C attachImageToInput 미리보기 thumbnail 대기 10초
- C enterProject 4중 폴백 + textContent 정확 매치 (div.truncate own text)
- D attachPath realpath 2중 검증 (server.js L1870)

## ⚠ 미해결 / 사장님 결정 대기

### conversation 학습 오염 (Phase E 8차 결과 보면 사과가 아닌 결과)
- 사장님 "프로젝트(조)" 기존 9개 대화가 각자 다른 학습 컨텍스트(Causone 박스, 카메라 펜던트 등) 보유
- 우리 사과 프롬프트 + 사과 사진 첨부해도 ChatGPT는 대화 history 학습 우선 → 사과 아닌 다른 결과
- 해결책 A (정석): 사장님이 "프로젝트(조)" 안에 **빈 대화 9개+ 새로 만들어 두기** (예: "자동생성 슬롯 1~9"). 각 빈 대화에 "여기서는 이미지 생성만 합니다, 매 메시지마다 첨부 + 프롬프트 그대로 처리" 같은 시스템 지시 한 줄
- 해결책 B (휴리스틱): 가장 사용 안 한 대화 우선 선택 — 완벽 X
- 사장님 결정 대기

### sanity 한글 path 인코딩 (curl 한정, 무해)
- bash curl이 한글 path 깨뜨림 → 서버 attachPath rejected 오인
- JS fetch는 UTF-8 자동 → 도구 UI 정상
- 우려 X, 단 sanity 진단 시 인지

## 회귀 방어 메모

- chatgpt-image.mjs ESM 동적 import는 서버 재기동해야 반영. 코드 수정 후 7777 서버 죽이고 다시 띄워야 함 (잡 직렬화 큐도 초기화).
- 사장님 사이드바 진단 PNG 비교: "고정됨" 섹션 아래 "프로젝트(조)" 항목 + 펼침 시 들여쓰기(ps-9) conversation 목록 + "더 보기" 버튼 1개. 이 구조가 바뀌면 enterProject / findConversationUrls / 더 보기 클릭 셀렉터 재검증
- 이미지 다운로드 셀렉터 `img[src*="chatgpt.com/backend-api/estuary"]` — ChatGPT가 도메인 바꾸면 IMG_SELECTORS 최우선 줄 갱신
- `_chatgptChainTail`은 잡 직렬화 — 동시 잡 안 됨. 동시 사장님 ⇒ 자동 흐름 + ↻ 재생성도 직렬화됨 (정상). 큐 길어지면 사장님께 진행 표시 안내 필요
- 사장님 ChatGPT 계정 차단 위험: stagger 5초 + 인간 패턴 흉내 중. 일일 50+ 페이지면 위험 ↑. 차단 시 사장님 다른 계정 또는 시간 대기

## 다음 작업 후보

1. **빈 대화 자동 생성 모드** (사장님이 빈 대화 만드는 게 귀찮으시면) — 단 사장님 "새 대화 만들지 마" 지시와 충돌, 사장님 결정 필요
2. **대화 선택 휴리스틱** — 가장 사용 안 한 conversation 우선
3. **잡 진행 사장님 진척 표시 강화** — 직렬 큐 대기 중일 때 안내
4. **「⚡ 주어진 자료로 바로 제작」 흐름과 통합** — 이미지 다 있을 때 plan→generate 자동 연쇄 (현재 이미 작동)
5. style.css dead CSS 정리 (v0.7 Higgsfield 잔재 — 별도 todos)
