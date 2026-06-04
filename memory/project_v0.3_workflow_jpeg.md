---
name: 상세페이지 제작자 v0.3 — 4-Step 워크플로우 + JPEG 변환
description: 카피만 받아 곧장 HTML 만들지 않고 (1) 기획·이미지 프롬프트 → (2) 사장님 ChatGPT 이미지 받기 → (3) 슬롯 매칭 → (4) 최종 HTML 흐름. JPEG zip 자동 분할 다운로드 추가. 2026-05-14.
type: project
---

# v0.3 진척 스냅샷 (2026-05-14)

## 사장님 핵심 지시 (이번 회차)

1. **워크플로우 재설계** — 카피만 받아 곧장 HTML X. **기획부터 짜고 → 필요한 이미지 프롬프트 만들어 사장님이 ChatGPT에 던지고 → 슬롯에 받은 이미지 드롭 → 최종 HTML 생성**
2. **결과 영역 JPEG/HTML 다운로드 2칸** — 단, **JPEG 변환은 버튼 클릭 시에만** (자동 변환 X)
3. **레퍼런스 심층 연구** — "과연 같지가 않다" 피드백 → 더 깊이

## 신규/변경 파일

| 파일 | 변경 |
|---|---|
| `code/server.js` | `/api/plan`, `/api/render-jpeg` 신규. `/api/generate` 에 plan + slot-image 매핑 수용 |
| `code/public/index.html` | 좌측 panel을 Step 1~4 카드 구조로 통째 교체 |
| `code/public/app.js` | `callPlan`, `renderPlanCards`, `renderSlotCards`, `setupSlotDropzone`, `downloadJPEG` 등 신규 |
| `code/public/style.css` | `.step`, `.prompt-card`, `.slot-card`, `.download-grid` 추가 |
| `code/package.json` | `playwright`, `sharp`, `archiver` 의존성 추가 |
| `references/freelancers/kwayeon.json` | (기존) 빌티니 결로 작성된 상태 — **사장님 결정 후 정정** |
| `benchmarks/kwayeon_deep_dive.md` | 심층 분석 보고 + 1차 분석 오류 정정 |
| `fonts/MaruBuri/` | 마루부리 OTF 5종 (이전 회차) |
| `fonts/GraceSerif/` | 우아한 세리프 OTF 2종 (이전 회차) |

## 4-Step 워크플로우 (좌측 패널)

```
Step 1. 기본 입력
  ├ 참고 이미지(선택)
  ├ 상세페이지 내용
  ├ 디자인 스타일 / 레퍼런스 / 내용 스타일
  └ [① 기획 · 이미지 프롬프트 생성]

Step 2. 요청 프롬프트  (Step 1 완료 시 unlock)
  ├ 기획 요약 박스
  ├ 영문 프롬프트 카드 N개 (각 카드 복사 버튼)
  └ [모든 영문 복사] / [.txt 다운]

Step 3. 요청 이미지  (Step 1 완료 시 unlock)
  ├ slug별 빈 드롭존 카드 N개
  └ 드롭/클릭으로 매칭, 채워지면 ✓ 표시

Step 4. 최종 생성  (Step 1 완료 시 unlock)
  ├ [② 상세페이지 HTML 생성]
  └ 결과: 미리보기 + [📥 JPEG zip] + [📥 HTML]
```

## API 흐름

```
POST /api/plan       → Claude CLI 1차 호출, plan JSON 반환
                       { summary, sections[], image_requests[] }
POST /api/generate   → plan + slot 이미지 받아 최종 HTML
                       (이미지 항목에 slug 부여, plan.sections.image_slug 와 매칭)
POST /api/render-jpeg → HTML 받아서 Playwright fullPage 캡처 → sharp 분할 → archiver zip
                       (max_page_height 기본 3000 — 크몽 한도)
```

## 이미지 슬러그 매칭 규칙

- plan의 `image_requests[i].slug` ↔ 사장님이 드롭한 슬롯
- Step 3에서 슬롯에 이미지 드롭 → app.js의 `state.slotImages[slug] = {name, dataUrl}`
- generate 호출 시 images 배열의 각 항목에 `slug` 필드 동봉 → server 가 `saveBase64Image` 후 `{path, slug, name}` 저장
- `buildGeneratePrompt`가 slugToPath 맵 만들어 plan.sections에 이미지 경로 주입
- 누락된 슬러그는 placeholder `<div data-slug="...">` 로 처리

## JPEG 변환 (`/api/render-jpeg`)

- 의존성: **playwright + sharp + archiver** (lazy require — 서버 부팅 시 검사 X)
- Chromium 별도 설치 완료 (`npx playwright install chromium`)
- 입력: `{ html, width=1000, max_page_height=3000, quality=90 }`
- 동작:
    1) Playwright Chromium 띄움 → file:// 로드 (CDN 폰트 1.2초 + document.fonts.ready 대기)
    2) fullPage PNG 캡처 → uploads/render_*/full.png
    3) sharp 으로 max_page_height 안에 균등 분할 (예: full=15000px / max=3000 → 5장)
    4) 각 페이지 JPEG (mozjpeg=false, 기본 quality=90)
    5) archiver zip 으로 응답 (Content-Disposition: attachment)
- 검증 완료 (2026-05-14): 짧은 테스트 HTML → 64KB zip / 01_full.jpg 78KB (정상)

## ⚠️ 사장님 결정 대기 — 레퍼런스 정체

**중대한 발견**: 우리가 "과연 작품"이라고 알았던 **빌티니 TV스탠드(포트폴리오 ID 105485)는 사실 "슈터SHOOTER" 작품**. 크몽 포트폴리오 메타에 "디자이너: 슈터SHOOTER" 명시.

→ 1차 분석에서 빌티니 결로 추출한 명세(감성·섬세·프리미엄, 마루부리, 회색·골드)는 **슈터 결**이지 과연 결이 아님.
→ 사장님이 "과연 같지가 않아"라고 느낀 정확한 이유.

**과연의 진짜 결**:
- 가성비 베스트셀러 (1만~10만 패키지 3단)
- Pretendard 산세리프 단일
- 화이트 베이스 + 카테고리별 적응 (시그니처 컬러 고정 X)
- 친근 인장 "프리랜서 과연입니다 (•ᴗ•)"
- 명확 CTA (잔잔 클로징 X)

### 사장님 선택지 (보고 후 결정)
- **A) 슈터로 리네이밍**: `kwayeon.json` → `shooter.json`, 내용 그대로
- **B) 과연 v2 채택**: 보고서의 새 JSON 으로 `kwayeon.json` 갈아엎기
- **C) 둘 다 (추천)**: 두 작가 동시 등록, 사장님이 골라쓸 수 있게

자세한 분석: `benchmarks/kwayeon_deep_dive.md`

## 다음 작업 후보

1. **레퍼런스 정체 결정** (사장님 답변 후 즉시 작업, 5~20분)
2. **실 테스트**: 좌측 4-Step 워크플로우 → 빌티니 결의 sales_v2_10 콘텐츠 재제작 → JPEG 다운 → 1차와 시각 차이 비교
3. **이미지 슬러그 자동 매칭**: 사장님이 ChatGPT로 받은 이미지 파일명에 slug 들어있으면 자동 매칭 (현재는 수동 드롭)
4. **레퍼런스 카테고리화**: 향후 10명 이상 등록되면 "프리미엄/감성/캐주얼/모던/가성비" 필터 추가
5. **plan JSON 미리보기/편집**: 사장님이 Step 2에서 카피 줄을 직접 고쳐서 Step 4에 반영 (현재는 read-only)

## 단축 명령 (PowerShell)

```powershell
# 서버 재시작
$conn = Get-NetTCPConnection -LocalPort 7777 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id ($conn.OwningProcess | Select-Object -First 1) -Force; Start-Sleep -Milliseconds 800 }
Start-Process wscript.exe "C:\Users\MYCOM\Documents\조현준편집파일 329부터\클로드코드\코존워크스페이스\domains\상세페이지 제작자\code\start_hidden.vbs"

# JPEG 변환 단발 테스트
Invoke-WebRequest -Uri "http://127.0.0.1:7777/api/render-jpeg" -Method POST `
  -Body (@{html='<html>...</html>'; max_page_height=3000} | ConvertTo-Json) `
  -ContentType 'application/json; charset=utf-8' -OutFile "$env:TEMP\out.zip"
```
