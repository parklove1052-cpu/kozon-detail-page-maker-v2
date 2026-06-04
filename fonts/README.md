# 폰트 저장소

상세페이지 제작자 도메인이 사용하는 **로컬 무료 폰트** 모음.

## 폴더 구조

```
fonts/
├─ README.md            ← 이 파일
├─ MaruBuri/            ← 네이버 마루 부리 (본문 명조)
│   ├─ MaruBuri-ExtraLight.otf
│   ├─ MaruBuri-Light.otf
│   ├─ MaruBuri-Regular.otf
│   ├─ MaruBuri-SemiBold.otf
│   └─ MaruBuri-Bold.otf
├─ GraceSerif/          ← 우아한 세리프 (디스플레이/제목)
│   ├─ GraceSerif-Regular.otf
│   └─ GraceSerif-Bold.otf
└─ GraceSerif-OTF.zip   ← 원본 백업
```

## 폰트별 정보

### 1. 마루 부리 (Maru Buri) — 본문 명조 ★ 1순위
- **제작**: 네이버 (한글한글아름답게)
- **결**: 부드럽고 우아한 세리프, 디지털 화면에 따뜻함을 더하는 본문용 명조
- **굵기**: ExtraLight / Light / Regular / SemiBold / Bold (5단)
- **라이선스**: **SIL Open Font License 1.1 (OFL)** — 상업적 사용 자유, 폰트 자체의 유료 판매만 금지
- **출처**: https://github.com/fonts-archive/MaruBuri (네이버 공식 미러)
- **추천 용도**: 본문 / 부제 / 캡션 — 과연 결의 "감성·섬세·프리미엄" 본문 명조 1순위

### 2. 우아한 세리프 (GraceSerif) — 디스플레이/제목
- **제작**: 디스이즈페어웨이 (disthispairway)
- **결**: 클래식·화려·판타지 결의 디스플레이 세리프 — 제목/슬로건용
- **굵기**: Regular / Bold (2단)
- **라이선스**: **OFL** — 인쇄/웹사이트/패키징/영상/임베딩/BI·CI 모두 허용
- **출처**: https://pearway.kr/#type/graceserif
- **추천 용도**: 큰 헤드라인 / 슬로건 1줄 / 표지 컷 (본문엔 가독성 부담)

### 3. Pretendard (이미 CDN 사용 중) — 본문 산세리프
- **제작**: orioncactus
- **결**: 시스템 폰트 결, 본문 가독성·9 weight
- **라이선스**: OFL
- **CDN**: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css`
- **추천 용도**: 본문 산세리프 / 캡션 / 데이터/스펙 표

## HTML에서 사용하기

### A. CDN 권장 (인터넷 연결 시 가장 안전)

```html
<head>
  <!-- Pretendard -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
  <!-- 마루 부리 (마루 부리 공식 CSS는 5종 weight 자동 포함) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/fonts-archive/MaruBuri/MaruBuri.css">
  <style>
    body { font-family: 'Pretendard', sans-serif; }
    h1, h2 { font-family: 'MaruBuri', serif; font-weight: 700; }
  </style>
</head>
```

### B. 로컬 파일 (오프라인 보장)

```css
@font-face {
  font-family: 'MaruBuri';
  src: url('./fonts/MaruBuri/MaruBuri-Regular.otf') format('opentype');
  font-weight: 400;
}
@font-face {
  font-family: 'MaruBuri';
  src: url('./fonts/MaruBuri/MaruBuri-Bold.otf') format('opentype');
  font-weight: 700;
}
@font-face {
  font-family: 'GraceSerif';
  src: url('./fonts/GraceSerif/GraceSerif-Regular.otf') format('opentype');
  font-weight: 400;
}
```

> ⚠️ HTML → PNG 캡처 워크플로우(Playwright)에서는 file:// 로드 시 폰트가 지연 로드될 수 있음. **CDN을 우선 사용**하고, 로컬 파일은 백업.

## 레퍼런스 작가별 폰트 매칭

| 레퍼런스 | 헤드라인 | 본문 | 비고 |
|---|---|---|---|
| 과연 (kwayeon) | MaruBuri SemiBold/Bold | MaruBuri Regular 또는 Pretendard | 차분·우아·프리미엄 명조 결 |
| (추후 추가) | | | |

## 새 폰트 추가 시

1. `fonts/<폰트명>/` 폴더 생성
2. .otf / .ttf 파일 저장
3. 이 README에 항목 추가 (라이선스 명시 필수)
4. 레퍼런스 JSON의 `design_tokens.fonts` 에 매칭

## 절대 금지

- 폰트 파일 자체를 외부에 유료 판매
- 라이선스 불명 폰트 사용 (OFL / 상업적 무료 표기 없으면 사용 금지)
- 회사 BI/CI 로고에 사용 시 **예스 명조 같은 BI/CI 불가 폰트** 주의 (현재 다운된 2종은 모두 BI/CI OK)
