---
name: 상세페이지 제작자 v0.5.2 — ⚡ 직접 제작 2단계 자동 연쇄 + cmd.exe UTF-8 우회 + config 핫 리로드
description: 단일 거대 generate 호출의 timeout 빈발 → ⚡를 plan(짧음) + generate(짧음) 두 단계 자동 연쇄로 재구성해 안정성 ↑. Node v24 + Windows .cmd shell:false → EINVAL 발견 후 cmd.exe /c + chcp 65001 우회로 한글 stdin 인코딩 깨짐도 동시 해결. callClaude 핫 리로드로 서버 재시작 없이 config 변경 반영. Codex 2라운드 리뷰 진단 반영.
type: project
---

# v0.5.2 (2026-05-20)

## 발단 — 사장님 두 차례 실패

1. **1차 실패** (2026-05-19 1735): ⚡ 누름 → 23.3초 만에 `claude 종료코드 1 (no stderr)`. CLI는 돌긴 돌았는데 죽음.
2. **2차 실패** (2026-05-19 후속): ⚡ 누름 → 180.3초 만에 `claude 호출 타임아웃 (180000ms)`. config는 360000으로 바꿨는데 옛 서버가 캐싱.
3. 사장님 지시: "호출 타임아웃인 것 같은데, 그럼 어떤 구조가 좋을지 생각해봐"

## 결정: ⚡를 2단계 자동 연쇄로

```
이전: ⚡ → /api/generate(plan=null, 모든 거 한 번에) → 5분+ → timeout
변경: ⚡ → /api/plan(60~90초, 짧음) → /api/generate(60~120초, plan 전달) → 완료
```

- 사장님 체감 UX: ⚡ 한 번만 클릭. UI는 1/2 → 2/2 단계 자동 진행
- LLM에 명확한 두 작업으로 분산 → 각 호출이 짧아 timeout 거의 안 남
- plan이 sections·image_slug·image_requests를 명확히 알려주므로 generate 더 빠름
- 첨부 이미지가 다 있으면 plan의 image_requests는 거의 비어서 generate 추가 부담도 적음

## 핵심 변경

### A. `code/public/app.js` callDirectGenerate 재작성
- 두 단계 자동 연쇄 — try/catch가 두 개로 분리되어 실패 시 어디서 막혔는지 명확 ("1단계 — 기획" vs "2단계 — HTML")
- 단계별 로딩 메시지 (`⚡ 1/2 — 기획·이미지 매칭 중...`, `⚡ 2/2 — 상세페이지 HTML 생성 중...`)
- Step UI 자동: 1=done → 2=lock(진행중)→done → 3=skipped → 4=lock→done
- 1단계 응답으로 `state.plan` + `state.attachedPathMap` 채움 (혹시 결과 영역에서 카드 보게 될 때 썸네일 매칭)
- 1단계 timeoutMs 200000 (3분), 2단계 400000 (6분 + 여유)
- console.log에 `[direct-generate:1/2 plan]` `[direct-generate:2/2 generate]` 라벨 (F12 추적용)

### B. `code/server.js` callClaude config 핫 리로드
```js
// 이전: 모듈 로드 시점의 CONFIG.claude_timeout_ms 고정
// 변경: 매 호출 시 loadConfig().claude_timeout_ms 사용
let timeoutMs = 600000;
try { timeoutMs = loadConfig().claude_timeout_ms || timeoutMs; } catch (_) {}
```
- 사장님이 config.json만 바꾸면 서버 재시작 없이 timeout 반영

### C. Codex 진단 — Node v24 EINVAL 발견 + cmd.exe + UTF-8 우회 (v0.5.1 마무리분)
- **Node v24.15.0**: Windows에서 `.cmd` 파일을 `shell:false`로 spawn 시 **무조건 EINVAL** (보안 패치)
- Codex가 권장한 `shell:false` 수정이 이 시스템에서는 spawn 자체를 부쉈음
- 우회 발견: `spawn('cmd.exe', ['/c', 'chcp 65001 >nul && claude -p --output-format text'], ...)`
  - `cmd.exe` 직접 spawn → EINVAL 회피
  - `chcp 65001` → UTF-8 코드 페이지 강제 → 한글 prompt stdin 깨짐 동시 해결
- checkClaudeCli도 동일 패턴 적용
- 검증: `/api/health` → `claude_cli:{"ok":true,"version":"2.1.126 (Claude Code)"}` 정상 복구

### D. Codex 1라운드 리뷰 11개 반영 (이미 v0.5.1에서 처리됨)
- 클라 AbortController + timeoutMs (plan 200s, generate 400s, jpeg 300s, extract 200s)
- `markDownloadState(idle/pending/success/failed)` — 다운로드 영역 상태 시각화
- `showErrorBox` 영구 에러 박스 (토스트 사라져도 화면에 남음)
- 서버 readBody → 413, mkdirSync 별도 catch, /api/health에 claude_cli 가용성 포함
- 서버 시작 시 `claude --version` 사전 점검

## 디버그 자산
- `code/uploads/_last_prompt.txt` — 매 callClaude 호출의 prompt 덤프 (덮어씀)
- `code/uploads/_last_output.txt` — 매 호출의 stdout·stderr·exit code 덤프
- 서버 콘솔: `[claude] 종료코드 X prompt_len=Y stdout_len=Z stderr_len=W`
- 서버 콘솔: `[generate:plan-based|direct] elapsed=X output_len=Y`
- 브라우저 F12: `[direct-generate:1/2 plan]` `[direct-generate:2/2 generate]`

## 가상 테스트 통과 (KOZON_PORT=7785)
- syntax: app.js / server.js OK
- 9개 식별자 매칭 모두 ✓ (1/2·2/2 라벨, plan→generate 전달, timeoutMs 200000, loadConfig 핫 리로드 등)
- /api/health → claude_cli ok, v2.1.126
- /api/dry-run-prompt → 정상 prompt 생성

## 다음 라운드 후보 (메모만, 미반영)
1. **첨부 이미지 두 번 전송 부담** — plan과 generate 양쪽에 base64 전송. 큰 이미지면 부담 ↑. 해결책: plan 응답에서 session_dir 받아 generate에는 session_dir만 전달. 서버에서 이미지 재사용.
2. **백그라운드 job + 폴링** — 진짜 5분+ 작업이면 클라 fetch 자체를 비동기로. 페이지 닫아도 작업 보존.
3. **normalizePath 한계** (어제 Codex 리뷰 미반영) — 첨부 이미지 short id로 대체.
4. **disabled 버튼 접근성** — aria-describedby 패턴.

## 운영 메모
- 서버 재시작 후 변경 반영 (callClaude 자체는 핫 리로드 됐지만 import·라우트는 재시작 필요)
- 브라우저 Ctrl+F5로 새 app.js / index.html 받기
- 결과 HTML: `domains/상세페이지 제작자/output/detail_*.html` 자동 저장
- output·uploads 폴더는 시간 지나며 쌓이니 가끔 정리 필요
