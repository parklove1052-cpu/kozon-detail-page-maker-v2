---
name: v0.5.6 — HTML 복원 + claude Write 도구 차단 (--tools "" + prompt 가드)
description: ROCKMAN ZERO 향수 상세페이지 생성 시 claude가 Write 도구 시도 → "권한 거부" 안내만 받고 HTML 실체 없음. --tools "" + 강가드 prompt 동시 적용으로 종결. _restore.mjs로 _last_prompt.txt 재실행 복원 패턴 확립.
type: project
---

# v0.5.6 (2026-05-25)

## 사건

사장님이 모던/과연 reference + 향수(perfume) 카테고리로 상세페이지 생성 요청.
받은 파일(`kozon_detail_1779693130908.html`, 918 byte)이 HTML이 아닌 **"경로 쓰기 권한이 거부되어 저장이 안 됩니다…"** 안내 텍스트.

## 진단

- claude가 응답 중 `Write` 도구로 HTML을 직접 파일 저장 시도
- 도메인 폴더 권한 차단 → Write 실패
- 안내 텍스트만 stdout으로 흘러나옴 (HTML 실체 생성 X)

## 해결

### A. server.js — claude spawn에 `--tools ""` 추가

```js
proc = spawn('cmd.exe',
  ['/c', 'chcp 65001 >nul && claude -p --output-format text --tools ""'],
  { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
```

### B. buildGeneratePrompt 출력 규칙에 강제 가드

```
🚫 도구 사용 절대 금지: 이 작업은 순수 텍스트 응답만 받습니다.
Write·Edit·Bash·MultiEdit·NotebookEdit·Read·Glob·Grep·WebFetch·WebSearch·Task·TodoWrite
어떤 도구도 호출하지 마세요.
```

### C. `_restore.mjs` 복원 스크립트

`code/uploads/_last_prompt.txt` (14137자) → claude 재호출 → HTML 추출 → `output/detail_<ts>_restored_modern_kwayeon.html`

- cwd: `code/` (한글 경로 안전)
- 코드 블록 ```html``` 추출 + DOCTYPE/html 태그 검출 fallback
- 30분 polling 한도 + taskkill 강제 종료
- 실패 시 raw 저장

## 결과

- `output/detail_20260525_073354_restored_modern_kwayeon.html` 20.8KB
- ROCKMAN ZERO Car Perfume Balm R1001, 11섹션 (Hero → Lineup → Trust → USP01-03 → Scenarios → Spec → Voice → Closing → FAQ)
- 딥 네이비 #1A0F33 + 오렌지 #FF6A2C, Pretendard, 둥근 카드 + 인덱스 라인
- 누락 슬러그 3개(`lineup_6scents`/`voice_lifestyle`/`closing_lineup`)는 회색 placeholder + `data-slug`

## 진단 함정 (다음 세션 시간 절약용)

| 시도 | 결과 | 원인 |
|---|---|---|
| Git Bash `node -e` 인라인에 `--tools ""` 직접 전달 | exit 1, ENOENT | 인라인 cmd.exe 빈 따옴표 escape 깨짐 |
| `--disallowed-tools Write Edit ...` 다중 인자 | exit 1 | claude CLI multiple 인자 파싱 실패 |
| `--disallowed-tools "Write Edit ..."` 한 문자열 | exit 1 | 동일 |
| `--tools Read` (한 가지만 허용) | exit 1 | Git Bash 환경 인라인 한계 |
| `_restore.mjs` 스크립트(cwd=`code/`) | exit 0, HTML 20.8KB | **정답** |

→ 결론: `--tools ""` escape는 **Node 스크립트 파일 안에서만 안정**. Git Bash 인라인 `node -e`로는 검증 불가. `server.js`처럼 스크립트 파일로 spawn 호출하면 정상.

## 메모리 인덱스

- `feedback_claude_cli_text_only.md` — 텍스트만 받을 claude 호출 규칙
- 이 파일 — v0.5.6 사건 + `_restore.mjs` 복원 패턴
