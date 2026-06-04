---
name: 상세페이지 제작자 v0.4 — 과연 결 정정 + 이미지 오버레이 자유도 + 다운로드 UI
description: 1차 잘못 잡은 명세(감성·프리미엄·마루부리)를 _archive로 보존, 사장님 제공 URL 3건 기반으로 진짜 과연 결(Pretendard 산세리프·카테고리 적응·둥근 카드·해시태그)로 kwayeon.json 전면 재작성. buildReferenceBlock 강화, 이미지 오버레이 규칙 자유도 ↑, 결과 영역 다운로드 두 칸 최상단으로. 2026-05-15.
type: project
---

# v0.4 진척 스냅샷 (2026-05-15)

## 사장님 핵심 지시 (이번 회차)

1. **"과연 같지가 않아 — 레퍼런스 별로 더 심층 연구"**
2. **빌티니 vs 슈터 분기는 본질 X** — 화남. 결과 품질이 본질.
3. **진짜 과연 URL 3건 직접 제공**: portfolio/view/171340, 166830, 166821
4. **이미지 위 텍스트 오버레이 자유도 ↑** — 더 이쁘면 얹기 OK, 단 (1)포커스 가리지 않기 (2)가독성 색상
5. **결과 다운로드 버튼 UI 강조** — 생성 완료시 잘 보이게

## 1차 분석 오류 정정 (이번 회차 핵심 학습)

기존 `kwayeon.json` = **감성·섬세·프리미엄 / 마루부리 명조 / 회색·골드 #C9A961 / editorial still life**
→ **완전히 다른 결**이었음. 다른 디자이너(빌티니 작품 = 슈터SHOOTER) 결을 과연으로 오인.

사장님이 진짜 URL 3건 주신 뒤 Playwright + 이미지 직접 확인으로 결 확정.
잘못된 명세는 `references/_archive/kwayeon_v1_wrong_premium_serif.json` 로 보존 (1차 sales 페이지 컨텍스트 참조용).

### 교훈
- 외부 추정만으로 명세 만들지 말 것
- 사장님이 "좋아한다"고 한 결과물이 곧 "그 작가 결"이 아닐 수 있음
- 작가 정체성 메타 분기보다 결과 품질이 본질

## 진짜 과연 결 (확정 — 사장님 URL 3건 + 이미지 9장 직접 검증)

### 검증 작품
| URL | 업종 | 메인컬러 | 스타일 키워드 |
|---|---|---|---|
| 171340 | 미용·뷰티 (가슴 성형 보형물) | 핫핑크 #E2007A | 다채로운·사랑스러운·섬세한 |
| 166830 | 음료·식품 (콤부차) | 주황 #F5882A | 유쾌한·다채로운·역동적인 |
| 166821 | IT·마케팅 (블로그) | 다크 보라 #6E4BD9 | 단순한·진지한 |

### 공통 시각 패턴
- **폰트**: Pretendard ExtraBold/Black 산세리프 단일 (명조 X)
- **컬러**: 카테고리 적응형 — 시그니처 컬러 고정 X
- **둥근 카드 박스 반복** (corner-radius 20-24)
- **번호 인덱스** (01·02·03 큰 동그라미)
- **해시태그** (#FDA승인 #따뜻하게)
- **영문 라벨** (PERFORMANCE, NEW, OEM) 작게 보조
- 3D 아이콘 / 일러스트 / 폰 mockup 통합
- 분위기: 다이내믹·생생·친근·명료 (잔잔 X)

### 공통 카피 패턴
- 병렬 구조 반복: "행복을 함께합니다 / 라이프스타일을 함께합니다 / 문화를 함께합니다"
- 카드 라벨 + 본문: "맞춤형 서비스 제공 / 확실한 지수·공감 관리"
- 신뢰 신호: FDA·20년 경력·존슨앤존슨·특허·약속

## 변경 파일

| 파일 | 변경 |
|---|---|
| `references/freelancers/kwayeon.json` | **전면 재작성** — category_palettes(뷰티/음료/IT/전자/패션 5개), palette_strategy:adaptive, Pretendard ExtraBold, copy_patterns, image_direction.elements, 7단 section_pattern, do_dont 정정 |
| `references/_archive/kwayeon_v1_wrong_premium_serif.json` | 잘못된 1차 명세 보존 |
| `benchmarks/kwayeon_samples/` | 사장님 제공 3작품 메인+본문 이미지 9장 다운 (검증 근거) |
| `benchmarks/kwayeon_deep_dive.md` | benchmark-analyzer 분석 (참조용) |
| `code/server.js — buildReferenceBlock` | image_direction/image_prompt_overrides/fonts.cdn/shape 누락 필드 출력. 시각 강조 ⚠️ + ▌ 트리 |
| `code/server.js — buildGeneratePrompt` | reference 블록을 디자인 스타일 위로. "다른 작가 결로 나오면 실패" hard rule |
| `code/server.js — buildPlanPrompt` | 동일 적용. 영문 이미지 프롬프트도 reference image_direction 따르도록 |
| `code/server.js — handleDryRunPrompt` | 디버그 엔드포인트 신규 — Claude 호출 없이 프롬프트 본문 미리보기 (`POST /api/dry-run-prompt`) |
| `code/public/index.html` | 결과 영역 재구성 — ✓ 완료 배너 + 다운로드 2칸 hero 그리드 최상단 + 코드/미리보기 details 접기 |
| `code/public/style.css` | `.result-done-banner`, `.download-grid--hero`, `.btn--download`(2줄 라벨), `.result-details` 추가 |
| `CLAUDE.md §4` | 이미지 위 텍스트 오버레이 자유도 ↑ 4규칙 (포커스 X, 이미지 보기 X, 가독성 색상, 읽기 어려우면 포기) |
| `memory/detail_page_mobile_first.md` (글로벌) | 이미지 오버레이 자유도 규칙 동기화 |

## Codex 진단 (활용됨)

> "JSON 스펙 부정확 — 영향 최상" — kwayeon.json 자체가 다른 디자이너 결이었음 ✓ 확정
> "buildReferenceBlock에 image_direction 누락" — 핵심 이미지 톤이 안 박힘 ✓ 추가
> "reference 블록이 style 블록 아래라서 덮일 수 있음" — 순서 뒤집기 ✓ 적용

3개 진단 모두 채택 적용. Codex의 (B/d/e) 진단도 정확함을 확인.

## 다운로드 UI 재구성 (사장님 직접 지시)

### 변경 전
- 다운로드 버튼이 결과 코드/미리보기 **아래**에 묻혀 안 보임

### 변경 후
- ✓ 녹색 완료 배너 ("생성 완료 — 아래 버튼으로 다운로드하세요")
- **두 다운로드 버튼 hero 그리드**:
  - 시안색 `📄 상세페이지 다운받기 / 단일 HTML 파일 (.html)` 403×110
  - 마젠타색 `🖼️ JPEG로 다운받기 / 페이지별 분할 (.zip)` 403×110
- 결과 코드/미리보기는 `<details>` 접기로 보조 영역화
- 모바일 720px 미만 자동 1칸 stack
- Playwright E2E 검증 통과 (8개 활성 버튼 + 2개 조건부 숨김 정상)

## 다음 작업 후보

1. **실 테스트** — 새 kwayeon 명세로 좌측 4-Step 한 번 돌리기 → 결과가 진짜 과연 결로 나오는지 확인
2. **buildReferenceBlock 추가 강화** — category_palettes / copy_patterns / image_direction.elements 도 프롬프트에 출력 (지금은 일부 미주입)
3. **카테고리 자동 매칭** — 사장님 카피의 제품 키워드로 적합 palette 자동 선택 (현재는 default)
4. **새 레퍼런스 추가** — 사장님이 좋아하시는 다른 작가 URL 공유 시 동일 절차
5. **plan JSON 편집** — Step 2 결과의 카피·이미지 요청을 사장님이 직접 수정 가능하게

## 단축 명령

```powershell
# 서버 재시작 (server.js 변경 시만)
$conn = Get-NetTCPConnection -LocalPort 7777 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id ($conn.OwningProcess | Select-Object -First 1) -Force; Start-Sleep -Milliseconds 800 }
Start-Process wscript.exe "C:\Users\MYCOM\Documents\조현준편집파일 329부터\클로드코드\코존워크스페이스\domains\상세페이지 제작자\code\start_hidden.vbs"

# JSON/HTML/CSS/JS 변경만은 재시작 불요 (loadReferences 매번 fresh, public/* 정적 서빙)

# 프롬프트 dry-run (Claude 호출 없이 프롬프트 본문 확인)
$body = @{ style_key='premium'; reference_key='kwayeon'; text='테스트'; kind='generate' } | ConvertTo-Json
Invoke-WebRequest -Uri "http://127.0.0.1:7777/api/dry-run-prompt" -Method POST -Body $body -ContentType "application/json; charset=utf-8"
```
