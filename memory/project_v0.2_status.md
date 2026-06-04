# 상세페이지 제작자 v0.2 — 진척 스냅샷 (2026-05-13)

> 다음 세션에서 이어 작업할 때 참고용. 시스템 전체 그림 + 다음 작업 후보.

## 한 줄 요약

도메인 루트 **`상세페이지 제작기.html`** 더블클릭 → 끝.
검정 네온 UI + 5개 전문 에이전트 + 이미지 프롬프트 생성기.
사장님 추가 비용 0원 (Claude 구독 + 사장님 ChatGPT Plus 활용).

---

## 시스템 구조 (5개 구성 요소)

| 위치 | 역할 |
|---|---|
| `시작폴더\KOZON Detail Page Maker.lnk` | PC 켜면 vbs 자동 실행 (사용자 영역 시작폴더) |
| `code\start_hidden.vbs` | node를 hidden 창으로 spawn. 한글 0자 (인코딩 안전) |
| `code\server.js` | 포트 7777 백엔드. CORS(file://null + localhost) + 정적 서빙 + claude CLI spawn |
| `상세페이지 제작기.html` (도메인 루트) | 사장님 진입점. iframe만 1줄로 `./code/public/index.html` 임베드 |
| `code\public\` (index.html / app.js / style.css) | 실제 UI |

## 핵심 분리 원칙

- **즉시 처리** (브라우저 안에서만): UI 토글, 입력 검증, 이미지 미리보기, 🎨 **이미지 프롬프트 생성**
- **느린 처리** (브라우저 → 서버 → claude CLI, 30초~2분): 💡 내용 추출, 📦 상세페이지 생성
- claude CLI cwd = 도메인 폴더 → 도메인 `CLAUDE.md` + `.claude/agents/*` 자동 로드

## 자동 시작 흐름

```
PC 부팅 → 로그인 → 시작폴더 .lnk → wscript → start_hidden.vbs → node server.js (hidden, 포트 7777)
```

vbs 안전장치: 이미 7777 떠있으면 `EADDRINUSE`로 두 번째 인스턴스 조용히 종료. 중복 실행 불가.

---

## 검정 네온 UI

3색 분리 — 사장님이 한눈에 패널 구분 가능:
- **시안** (좌측): 📦 상세페이지 만들기
- **마젠타** (우측 상단): 💡 내용 추출하기
- **보라** (우측 하단): 🎨 이미지 프롬프트

전역: 그리드 배경 + 듀얼 컬러 로딩 스피너(시안+마젠타 역회전) + 토스트 컬러 바 + 스크롤바 호버 그라데이션 + `[hidden]` 글로벌 보장.

---

## 5개 전문 에이전트 (`.claude/agents/`)

| 에이전트 | 역할 | 산출 폴더 |
|---|---|---|
| `product-researcher` | 도매처 URL/이미지 → 스펙·USP JSON | `research/` |
| `copy-writer` | 4가지 톤(감성/정보/혜택/친근) 카피 | `copy/` |
| `layout-designer` | 4가지 디자인(프리미엄/캐주얼/미니멀/모던) HTML | `output/` |
| `benchmark-analyzer` | 경쟁사 분석 (강·약점·차별포인트) | `benchmarks/` |
| `page-qa` | 플랫폼 호환·금칙어·과대광고 검수 | `qa/` |

권장 워크플로우: `product-researcher` → `benchmark-analyzer`(선택) → `copy-writer` → `layout-designer` → `page-qa`

도메인 전용 — 다른 도메인 세션엔 노출되지 않음.

---

## 🎨 이미지 프롬프트 생성기 (룰베이스, 즉시)

입력: 상품 영문 설명 + 컷 종류 + 디자인 톤 + 플랫폼 + 추가 디렉션
출력: ChatGPT 이미지 생성에 그대로 붙여넣을 영문 프롬프트 + 한글 메모

### 컷 × 플랫폼 매트릭스

| 컷 | 비율 | 네이버(860) | 쿠팡(780) | 인스타 | 자사몰 |
|---|---|---|---|---|---|
| 메인 비주얼 | 1:1 | 860×860 | 780×780 | 1080×1080 | 1024×1024 |
| 디테일 클로즈업 | 1:1 | 860×860 | 780×780 | 1080×1080 | 1024×1024 |
| 사용 시나리오 | 3:2 | 860×573 | 780×520 | 1080×720 | 1536×1024 |
| 인포그래픽 | 4:5 | 860×1075 | 780×975 | 1080×1350 | 1024×1280 |
| 비교 컷 | 2:1 | 860×430 | 780×390 | 1080×540 | 2048×1024 |
| CTA 배너 | 16:9 | 860×483 | 780×439 | 1080×608 | 1792×1008 |

### 디자인 톤 4종 (영문 modifier)
- premium: chiaroscuro + deep navy/charcoal + gold/copper + luxurious
- casual: bright airy daylight + vibrant pastels + cheerful
- minimal: even soft + white + single accent + clean restrained
- modern: high-contrast colored gel + gradient neon + bold asymmetric

### 사장님 사용 흐름 (추가 비용 0원)
1. 우측 보라 패널에 영문 상품 설명 입력
2. 컷/톤/플랫폼 선택 → "프롬프트 생성" 클릭 (즉시)
3. "📋 영문 프롬프트 복사" → ChatGPT Plus에 붙여넣기
4. 생성된 이미지 다운로드 → 좌측 시안 드롭존에 투하 (Ctrl+V 가능)
5. 좌측 "상세페이지 생성" 클릭

---

## 다음 작업 후보 (사장님이 "더 해보자" 하실 때 시작점)

1. **🤖 AI 보강 버튼** — 룰베이스 프롬프트 옆에 "더 풍부하게" 버튼. claude CLI 호출로 상품·맥락 반영해 프롬프트 발전 (30초~2분 대기 감수)
2. **배치 모드** — 한 상품의 6컷 다 만들 프롬프트 한 번에 산출 + zip으로 묶기
3. **한글→영문 자동 번역** — 이미지 프롬프트 input에 한글 입력 허용, 룰베이스 단어집 또는 claude CLI 호출
4. **브랜드 디자인 시스템 메모리화** — 코존코리아/이브덴메모리/미니멀리스트랩스 각 브랜드 색/폰트/톤 메모. layout-designer가 자동 우선 참조하도록 이미 코드는 준비됨, 메모리만 작성하면 동작.
5. **결과물 라이브러리** — 만든 HTML/프롬프트를 도구 안에서 검색·재사용 (output/ 자동 인덱싱)
6. **1688/도매처 URL 자동 처리** — URL 한 줄 입력 → product-researcher 에이전트 자동 호출 → JSON 산출
7. **컷 더 세분화** — 패키지 컷 / 컬러 옵션 컷 / 사이즈 비교 컷 / 후기 인용 컷 등 추가
8. **자동 리사이즈 안내** — 생성된 이미지 사이즈가 플랫폼 권장과 다를 때 UI에서 경고 + 자동 크롭 가이드
9. **다국어 UI** — 사장님 영어 입력도 가능하게 (현재는 한국어 정중체 위주)
10. **모바일 뷰** — 사장님이 스마트폰에서도 도구 사용 가능하게 (반응형은 일부만 적용)

---

## 안 하기로 결정한 것

- **Codex CLI 통합** (사장님 결정 2026-05-13): 사장님이 ChatGPT 웹에서 직접 이미지 만드는 방식 선호. Codex CLI 호출은 도구에 안 넣음.
- **Gemini Nano Banana API 통합**: 무료 여부 불확실 + 결제 시 장당 $0.039. 굳이 도구에 안 넣음. 사장님이 직접 Google AI Studio 웹 또는 ChatGPT Plus 활용.

---

## 핵심 파일 변경 이력 (v0.1 → v0.2)

- 추가: `상세페이지 제작기.html` (도메인 루트 진입점, iframe)
- 추가: `code\start_hidden.vbs` (한글 0자 자동시작)
- 추가: `code\public\app.js`의 이미지 프롬프트 생성기 (SHOT_PRESETS/STYLE_PRESETS/PLATFORM_SIZES + buildImagePrompt)
- 추가: `.claude\agents\{product-researcher, copy-writer, layout-designer, benchmark-analyzer, page-qa}.md`
- 변경: `code\server.js` — CORS(file:// null + localhost) 추가
- 변경: `code\public\app.js` — `API_BASE` + `api()` 헬퍼로 절대 URL fetch (file:// 호환)
- 변경: `code\public\index.html` — 우측 stack 구조 + 이미지 프롬프트 패널 추가, link/script 상대 경로
- 변경: `code\public\style.css` — 검정 네온 테마 전면 리뉴얼 + 3색 분리 + `[hidden]` 글로벌
- 변경: `CLAUDE.md` — "권장 에이전트" 섹션 5개 등록
- 삭제: `상세페이지 제작기 시작.cmd` (사장님이 정리 — vbs로 대체)

## 시작 폴더 바로가기

- `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KOZON Detail Page Maker.lnk`
- TargetPath: `wscript.exe`
- Arguments: `"...\code\start_hidden.vbs"` (도메인 폴더 기준)
- 끄려면 .lnk 파일 삭제. 도메인 코드는 그대로.
