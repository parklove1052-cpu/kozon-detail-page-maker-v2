---
name: 포트폴리오 3브랜드 자료·프롬프트 정리 (2026-05-21)
description: 크몽 입점 비승인(작업 사례 3건 부족) 보완용. 코존코리아 파워에너지바·미니멀리스트랩스 루미노엣지·이브덴메모리 카메라 팬던트 3건. 네이버 커머스 API로 상품 조회, 상세 PNG 시각 추출로 실 카피 확보, 사장님 PC 전체에서 원본 자료 600+개 분류, 도구 v0.5.3 입력용 프롬프트 3개 작성.
type: project
---

# 포트폴리오 3브랜드 (2026-05-21)

## 발단

크몽 입점이 두 가지 사유로 비승인:
1. 상세이미지에 작업 사례 3건 이상 없음
2. Standard 단가가 카테고리 평균(25만원)의 60% 이하

→ 사장님 선택: **카테고리를 "상세페이지 디자인"으로 이동 + 작업 사례 3건 확보** (단가 그대로 유지 가능)

## 작업 흐름

1. 네이버 커머스 API로 사장님 3개 스토어에서 대표 상품 1개씩 조회
2. 각 상품의 detailContent PNG 시각 추출로 실 카피 확보 (추정 카피 X)
3. 사장님 PC 전체 스캔으로 원본 자료 600+개 분류
4. 도구 v0.5.3 ⚡에 그대로 붙여넣을 프롬프트 3개 작성

## 3개 상품 (네이버 API 조회)

| 브랜드 | 상품명 | 가격 | 디자인 톤 | originProductNo |
|---|---|---|---|---|
| 코존코리아 | 파워에너지바 오리지널·포스닉·교체필터 3종세트 (Causone) | 17,000원 | 모던 | 13363823818 |
<!-- 2026-06-04 정정: 파워에너지바 v.1(6맛: 망고·수박·라임·민트·구아바·블루베리) vs 포스닉 에너지바 v.2(4맛: 레드불·민트·복숭아·청사과 + 멘톨 강화 포뮬러). 사장님이 "포스닉 카피 보내달라" 요청 시 prompt_01_powerenergybar.md를 그대로 보내면 오답 — 라인업 갈아끼울 것. -->

| 미니멀리스트랩스 | 루미노 엣지 알루미늄 아이폰 케이스 | 17,900원 | 미니멀 | 13127394583 |
| 이브덴메모리 | 타이드 카메라 팬던트 사진 인쇄 맞춤 제작 팔찌 | 60,000원 | 프리미엄 | 13161688895 |

자격증명·스크립트:
- `클로드코드/lib/naver_stores.js` (멀티스토어 클라이언트, KOJON·DHAYOUNG 자격증명 분리)
- `code/scripts/fetch_portfolio_products.js` (조회 스크립트)
- 결과: `output/portfolio_source/{powerenergybar,luminoedge,evdenmemory}_*_raw.json` + `_summary.json`

## 카피 추출 (PNG 시각 읽기)

네이버 상세페이지 본문이 사실상 **큰 PNG 1장에 담긴** 구조(SE 에디터 흔한 패턴) → detailContent 텍스트 거의 비어 있음.

해결: 각 상품 PNG를 다운받아 sharp으로 분할 + Read 툴로 시각 추출.
- 파워에너지바: 1000x13336 큰 JPG → 5조각 분할 (`01_part1.jpg` ~ `01_part5.jpg`)
- 루미노 엣지: 3장 시각 추출 (CASE 4가지, Q&A 내구성, 정품 인증)
- 이브덴 카메라 팬던트: 9장 명명 시각 추출 (01_hero ~ 09_photo_tip)

**중요 정정**: 처음 추정 카피는 완전 빗나갔음
- 파워에너지바 ≠ 건강기능식품 = **멘톨 흡입형 리프레쉬 인헤일러 (Causone, 망고·수박·라임·민트·구아바·블루베리 6종)**
- 루미노엣지 ≠ 단순 알루미늄 = **항공우주 등급 알루미늄 + 투명 렌즈면 설계 + 정품 인증서 동봉**
- 이브덴 ≠ 일반 사진 인쇄 = **들여다보기 + 빛으로 투사** 두 가지 감상 경험

## 사장님 PC 원본 자료 600+개 분류 (codex 도움)

`output/originals/`:

### evdenmemory (드하영) — 247개
- `uploads/` — 우리 도구에 어제까지 첨부한 모든 사진 93장 (13 세션)
- `photoshop/` — 드하영 로고 + 알리바바 OEM hash 5장
- `downloads_chatgpt/` — 4~5월 ChatGPT 작업분 20장
- `album_1iv덴소스/` — 1688 카메라 펜던트 페이지 리소스 12장 + 영상 4
- `r2_cache/` — Cloudflare R2 호스팅 캐시 49장 (확장자 자동 부여)
- `이브덴사업자/` — 사업자 등록증

### kojon (코존코리아) — 54개
- `msds/` — 교체필터·레드불코손·프리미엄코손 MSDS 안전문서 13장
- `trademark/` — Causone 상표 PDF
- `promo_video/` — 브루마블 광고 영상 zip (mp4 14개)
- `album_1코존코소스/` — 알리바바 OEM 원본 3장 (O1CN01*)
- `album_연기에너지바_iPhone/` — iPhone 촬영 5개
- `album_iPhone_videos/` — 키위 애노지바·영상재료 15개
- `downloads/` — 상세페이지_파워에너지바·제품 상세정보·제품 성분표 15장
- `docs/` — 코존코리아 상세페이지 수정안 docx

### minimalist (미니멀리스트랩스) — 87개 ⭐ Codex 도움으로 대폭 확보
- `album_옥수수7557_하드케이스/` — **사장님 직접 작업한 정본 PSD 7개 + JPG/GIF 7장**
- `album_星钥_iPhone17ProMax_OEM/` — 1688 OEM 30MB zip 원본 + 압축 해제 30장
- `album_O1CN_2208175109326/` — Downloads 알리바바 hash 26장
- `downloads/` — 디바이스를 벗기다·LuminoEdge 배너 4장
- `docs/` — 상세페이지미니멀랩스.docx + 루미노 엣지 S에디션 사전예약 PDF

### unclassified — 11개 zip
- `원까에_상세페이지모음/` — 사장님 예전 외주 다른 상품 zip (LED책·구데타마슬라임·텀블러·키티키링·폰거치대 등)

### 못 찾은 것 (사장님 추후 확인)
- 외장 USB (현재 미연결)
- 카카오톡 받은 파일 (외주 디자이너 자료)
- Canva 계정 (`dehayoung@`·`parklove1052@`)
- 네이버 스마트스토어 에디터 안 (플랫폼 저장본, PC엔 없음)

## 도구 v0.5.3 입력 프롬프트 (3개)

`output/prompts/`:
- `prompt_01_powerenergybar.md` — 모던 톤 / 정보형 / `output/originals/kojon/`
- `prompt_02_luminoedge.md` — 미니멀 톤 / 정보형 / `output/originals/minimalist/`
- `prompt_03_evdenmemory_camera_pendant.md` — 프리미엄 톤 / 감성형 / `output/originals/evdenmemory/`

각 prompt에는 사장님 페이지 실 카피(네이버 PNG에서 시각 추출한 텍스트) + 새 디자인 기획(컬러·섹션 흐름) 포함.

**중요 함정**: `.gitignore`에 `output/`이 있어 이 파일들은 git 추적 안 됨. 사장님 PC에만 보관 — 채팅에 텍스트 형태로 항상 남기는 게 더 안전.

## 다음 단계 (사장님)

1. 도구 v0.5.3 ⚡로 prompt_03 (이브덴) 먼저 시도 — 9장 이미지 풍부해 가장 잘 검증되는 케이스
2. 디자인 = 프리미엄, 내용 = 감성형 선택
3. 첨부 이미지 = `output/originals/evdenmemory/`에서 9장 선택
4. ⚡ 클릭 → 결과 확인 → OK면 prompt_01, prompt_02 동일 패턴 반복
5. 결과 3건 → 크몽 상세이미지 보완 자료로 등록 → 재신청
