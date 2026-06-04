---
name: 상세페이지 제작자 v0.5 — 2칸 이미지 입력 + 3-mode + 상품 락 + 자동 저장 + 상시 다운로드 버튼
description: Step 1 이미지 입력을 제품/기타 2칸으로 분할, 프롬프트 카드 3-mode 명시(신규·제품기준·서브보완), 상품 카테고리 락 사전(약70개), 결과 HTML 도메인/output/ 자동 저장, 다운로드 버튼 상시 노출 + 비활성 가드. Codex 리뷰 1라운드 반영(CSP·MIME allowlist·중복 키·fallback 분기·중복 클릭 가드).
type: project
---

# 상세페이지 제작자 v0.5 (2026-05-15)

## 한 줄 요약
사장님이 "프롬프트가 신규/제품기준/서브보완 중 뭐인지 표시 안 됨" + "다운로드 버튼이 안 보임" + "결과가 어디로 저장되는지 모름"을 지적해, Step 1 이미지 입력을 두 칸으로 분할하고 3-mode를 강제 표기하며, 결과를 도메인 output/에 자동 저장하고, 다운로드 두 버튼을 상시 노출하는 구조로 정비.

## 변경 파일
- `code/server.js`
- `code/public/index.html`
- `code/public/app.js`
- `code/public/style.css`

## 핵심 변경 6가지

### 1) Step 1 이미지 입력 2칸 분할 (제품 / 기타)
- `index.html`: 단일 dropzone → `.dropzone-grid` 좌(제품 사진) / 우(기타 이미지) 2칸
- `app.js`: `state.images` → `state.productImages` + `state.referenceImages` 분리. `addImageFile(file, kind)` / `renderImageList(kind)` / `setupDropzone(kind)` 일반화. 클립보드 paste는 `lastFocusedDropzoneKind` 기반으로 마지막 hover/클릭 대상에 들어감
- `style.css`: `.dropzone-grid`, 제품 dropzone 마젠타 강조(`pulse-magenta`), 기타는 기본 시안

### 2) 3-mode 프롬프트 표기 (LLM에게 강제, 클라엔 뱃지로)
- `server.js buildPlanPrompt`: prompt_mode 셋 중 하나로 무조건 채우도록 지시
  - `new_image` 🆕 신규 — ChatGPT 단독 생성
  - `product_based` 📎 메인 제품 기준 — 제품 사진 첨부 + 배경 변경
  - `reference_based` 🖼️ 서브 사진 보완 — 기타 이미지 첨부 + 변형
- 각 모드별 prompt_en 시작 문구·negative·attach_image_path 규칙 명시
- 첨부 조합(둘다/제품만/기타만/없음)별 우선 사용 모드 명시
- `app.js renderPlanCards`: 3-모드 매핑 + 첨부 모드면 ChatGPT에 같이 보낼 사진 썸네일 + 안내 ("이 사진을 ChatGPT에 같이 첨부해 주세요")
- `state.attachedPathMap` — 서버 절대경로 ↔ 원본 dataUrl/kind 매핑, `normalizePath`로 백슬래시·대소문자 흡수

### 3) 상품 카테고리 락
- `server.js`: `PRODUCT_FORM_DICT`(약 70개) + `detectProductForms()` + `buildProductFormLockBlock()`
- buildPlanPrompt와 buildGeneratePrompt 둘 다 최상단에 락 블록 박음
- 카피에 "팔찌"가 있으면 prompt_en 영문은 "bracelet"만 사용 강제. LLM이 임의로 necklace 등으로 못 바꿈
- **한계 (사장님 이미 인지)**: 사전 방식은 70개로 모든 상품 카테고리 못 커버. 다음 라운드 후보 — JSON에 `product_category_ko/en` 필드 추가해 LLM 자가 추출 + UI에 사장님 직접 입력 옵션

### 4) 결과 HTML 자동 도메인 저장
- `OUTPUT_DIR = path.join(ROOT, '..', 'output')` (도메인 루트/output/)
- handleGenerate에서 `extractHtmlFromOutput(output)`으로 코드 블록 파싱 → `detail_<ts>_<style>_<ref>_<hex>.html` 자동 저장
- 추출 실패 시 raw 텍스트도 `detail_raw_*.txt`로 저장 (디버깅용)
- 저장 실패는 try/catch로 삼키고 응답 계속 진행 (saved_name=null이면 클라가 다운로드 안내)
- `/output/<name>` 정적 서빙 라우트 추가

### 5) 다운로드 버튼 상시 노출 + 비활성 가드
- 기존: `#generate-result hidden` 안에 download 버튼 있어서 생성 전엔 보이지 않음 → 사장님이 "어디로 저장돼? 다운로드 버튼 어디 갔어?"
- 변경: `.download-grid--hero`를 Step 4의 ② 버튼 바로 아래 상시 노출. 생성 전엔 `disabled` + `.download-hint` 안내, 생성 후 자동 활성화
- 결과 details 영역(접힌)엔 "↗ 저장본 새 창에서 열기" 링크 추가 (`/output/<saved_name>`)

### 6) 환경변수 포트 override
- `process.env.KOZON_PORT`가 있으면 우선 사용, 아니면 `config.port`
- 가상 테스트·디버깅 시 별도 포트(7779/7780)에서 동시 부팅 가능

## Codex 리뷰 1라운드 반영
- ✅ 높음: /output/ 인라인 HTML 서빙 → 강한 CSP 헤더 적용 (`script-src 'none'` 등) + `X-Frame-Options: SAMEORIGIN`
- ✅ 중간: MIME allowlist (`.html` `.txt`만 허용, 그 외 404)
- ✅ 중간: PRODUCT_FORM_DICT '쿠션' 중복 키 → '쿠션팩트' / '쿠션 파운데이션'으로 분리
- ✅ 중간: renderPlanCards fallback이 attach_image_path 있을 때 무조건 product_based로 가던 버그 → attachedPathMap의 kind 보고 reference_based도 분기
- ✅ 중간: callPlan/callGenerate/callExtract/JPEG 다운로드 중복 클릭 가드 — `withInflight(key, btn, fn)` 헬퍼
- ✅ 낮음: 응답에서 `saved_path` 절대 경로 제거 → `saved_name` + `saved_url`만 전달

## 다음 라운드 후보 (미반영, 메모만)
1. **normalizePath 한계** (Codex E) — 백슬래시/대소문자만 정규화. trailing slash, `.`/`..`, URL 인코딩, UNC 경로 등 변형 미흡. 추천 조치: 서버가 첨부 이미지마다 short id 발급해 경로 대신 id 매핑.
2. **disabled 버튼 접근성** (Codex F) — 키보드/스크린리더 사용자는 title 안내 못 받음. `aria-describedby` 또는 `aria-disabled` 패턴.
3. **상품 카테고리 락 사전 한계** — JSON에 product_category_ko/en 필드 + LLM 자가 추출 + UI 직접 입력 옵션.

## 가상 테스트 통과 항목
- `/api/health` `/api/styles` `/api/references` 200
- `/api/dry-run-prompt`(plan/generate) — 상품 락 블록 "팔찌→bracelet, 팬던트→pendant" 정상 추출
- `/uploads/`, `/output/` 라우트 — path traversal 가드 정상
- `/output/_smoke.html` 서빙 시 CSP 헤더 박힘, `.js` 확장자 404 차단
- 정적 `/` index.html 200

## 운영 메모
- 서버 재시작 후 변경 반영됨
- 결과 HTML은 도메인의 `output/detail_<ts>_*.html`에 자동 저장
- 사장님이 다운로드 버튼 누르면 브라우저 다운로드 폴더(보통 `C:\Users\MYCOM\Downloads`)에도 받음 — 두 곳에 다 있음
- output/ 폴더가 시간 지나며 쌓이니 가끔 정리 필요 (현재 자동 정리 X)
