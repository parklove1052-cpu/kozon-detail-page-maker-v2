# 코존 상세페이지 제작 도구

로컬 HTML + Node 서버로 동작하는 상세페이지 제작 도우미.
- 좌측: 이미지 + 텍스트 + 스타일 → Claude CLI 호출 → 상세페이지 HTML 생성
- 우측: 자연어 → 상세페이지 섹션 구조로 정리 → 복사하기

## 실행

```powershell
cd "C:\Users\MYCOM\Documents\조현준편집파일 329부터\클로드코드\코존워크스페이스\domains\상세페이지 제작자\code"
node server.js
```

브라우저: http://127.0.0.1:7777

종료: Ctrl+C

## 구조

```
code/
├── server.js          # Node 내장 모듈만 사용 (외부 의존성 0)
├── package.json
├── config.json        # 포트, 스타일별 도메인 매핑
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── uploads/           # 업로드된 이미지 (세션별 폴더)
```

## 스타일별 도메인 변경

`config.json`의 `styles.<key>.domain_path` 를 원하는 폴더로 바꿉니다.
서버 재시작 없이도 `/api/styles` 와 `/api/generate` 는 매 요청 시 config를 재로드합니다.

예시:
```json
{
  "styles": {
    "premium": {
      "label": "프리미엄",
      "description": "...",
      "domain_path": "C:\\...\\domains\\상세페이지 제작자_프리미엄"
    },
    "casual": {
      "label": "캐주얼",
      "description": "...",
      "domain_path": "C:\\...\\domains\\상세페이지 제작자_캐주얼"
    }
  }
}
```

## 의존성

- Node.js 18+
- `claude` CLI (Claude Code) 가 PATH에 있어야 함
- 외부 npm 패키지 없음 (`npm install` 불필요)

## API

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |
| GET | `/api/styles` | 사용 가능한 스타일 목록 |
| POST | `/api/generate` | 상세페이지 생성 |
| POST | `/api/extract` | 자연어 → 섹션 구조 추출 |
| GET | `/uploads/<dir>/<file>` | 업로드 이미지 서빙 |

## 제한

- 이미지 1장당 최대 20MB
- 총 이미지 30장
- Claude CLI 타임아웃 3분 (정상 호출은 30초~2분)
- 로컬 전용 (127.0.0.1 바인딩)
