---
name: 상세페이지 제작자 v0.5.3 — Background Job + 자동 재시작 + 서버 버전 감지 + 전면 디버깅
description: timeout 영구 해결을 위해 LLM 호출을 background job + polling 구조로 전환. 자동 재시작 인프라(start_hidden.vbs·서버 재시작.bat)로 사장님 수동 재시작 부담 종결. SERVER_VERSION 시스템으로 옛 코드 실행 자동 감지. 4일간 사장님 반복 timeout 화남 → 본질 root cause(재시작 미반영) 발견 + 모든 갈래 해결.
type: project
---

# v0.5.3 (2026-05-21)

## 한 줄 요약
사장님이 ⚡ 시도할 때마다 timeout(23초·180초·356초·200초)으로 계속 화나심 → 4가지 원인 겹쳤음을 발견 → 각각 해결 + 본질 root cause(서버 재시작 미반영)까지 종결.

## 4가지 timeout 원인 (시간 순)

| # | 증상 | 진짜 원인 | 해결 |
|---|---|---|---|
| 1 | 5/19, 23초 종료코드 1 (no stderr) | shell:true + cmd.exe 한글 stdin CP949 깨짐 → claude가 깨진 prompt 받고 즉사 | `cmd.exe /c chcp 65001 && claude` UTF-8 페이지 강제 |
| 2 | 5/19, 180초 timeout | `claude_timeout_ms: 180000` 부족 | 360000으로 + `callClaude` 안 `loadConfig()` 핫 리로드 |
| 3 | 5/20, 356초 만에 또 180000ms 메시지 ← **본질 root cause** | 사장님 서버가 5/19 11:31 부팅 옛 인스턴스, 우리 패치 메모리에 없음 | SERVER_VERSION 시스템 + 자동 재시작 인프라 |
| 4 | 5/20 저녁, 200초 timeout (1단계 plan) | 클라 timeoutMs 200000 부족 + 더 본질적으로 HTTP 단일 요청에 LLM 5~10분 응답 묶는 구조의 한계 | **Background job + polling** (Codex 3순위) |

## 본질 root cause

> **사장님이 코드 패치마다 수동 재시작 안 하셔도 되는 자동화** 가 처음부터 없었음. 우리가 매번 패치 → 안내 → 사장님 안 함 → 옛 코드 실행 → 또 실패 → 사장님 화남 → 우리 또 패치... 의 반복.

## 핵심 변경

### A. Background Job + Polling (Codex 3순위 본 작업)

**서버 측 (`code/server.js`)**:
- `JOBS = new Map()` 전역 저장소 (1시간 TTL)
- `createJob(type, payload)` / `runJob(job, workerFn)` / `getJob(id)` / `jobPublicView(job)` 헬퍼
- 주기적 `setInterval(JOB_CLEANUP_INTERVAL).unref()` 메모리 누수 방지
- `POST /api/plan` → 즉시 `{ ok:true, job_id, type:'plan' }` 202 응답 (callClaude는 백그라운드)
- `POST /api/generate` → 동일 패턴 (callClaude + HTML 저장 모두 백그라운드)
- **`GET /api/jobs/:id`** → `{ id, type, state(queued|running|done|failed), elapsed_ms, error, result }`

**클라 측 (`code/public/app.js`)**:
- `pollJob(jobId, opts)` — 2초 간격, 30분 한도, 진행 메시지 콜백, 일시 네트워크 오류 재시도
- `callPlan` / `callGenerate` / `callDirectGenerate`:
  1. `/api/plan` 또는 `/api/generate` 호출 (timeoutMs 30000)
  2. 응답이 `job_id` 형태면 → `pollJob`으로 완료까지 폴링
  3. 응답이 즉시 결과(레거시)면 → 그대로 사용 (호환성 유지)

**효과**:
- LLM이 10분+ 걸려도 fetch 안 끊김
- 사장님이 페이지 새로고침해도 서버 작업 보존
- 진행 시간 실시간 표시: `⚡ 1/2 — 기획 중... (45초)` `(2분 13초)` ...

### B. 자동 재시작 인프라

**`code/start_hidden.vbs`** — 더블클릭 시 자동 옛 서버 교체:
```vbs
1. netstat -ano | findstr LISTENING → 7777 포트 PID 탐색
2. taskkill /F /T /PID <pid> → 옛 서버 트리 종료
3. 2초 대기 (TIME_WAIT 해제)
4. node server.js 숨김 실행
```

**`서버 재시작.bat`** (도메인 루트, 사장님 가시 더블클릭):
- 위와 동일하지만 로그 보임 + curl health 자동 확인 + Ctrl+F5 안내

### C. 서버 버전 감지 시스템 (재발 방지)

**서버**:
- `SERVER_VERSION = 'v0.5.3-2026-05-20'`
- `SERVER_BOOT_TIME = Date.now()`
- `/api/health` 응답에 포함:
  ```json
  {"server": {"boot_time", "uptime_ms", "version", "claude_timeout_ms"}}
  ```

**클라**:
- `CLIENT_EXPECTED_SERVER_VERSION = 'v0.5.3-2026-05-20'`
- `pingServer()`가 mismatch 감지 시:
  - 상단 dot 빨갛게 + title 호버에 차이점
  - 첫 감지 시 강력 토스트 (12초 노출)
  - `showErrorBox`에 🚨 옛 코드 안내 + `taskkill /F /PID` 명령어까지

### D. claude CLI 호출 안정화 (5/20 작업 + 유지)

```js
spawn('cmd.exe', ['/c', 'chcp 65001 >nul && claude -p --output-format text'], {
  cwd, stdio: ['pipe','pipe','pipe'], windowsHide: true
})
```
- Node v24 `.cmd shell:false` EINVAL 회피
- UTF-8 코드 페이지 강제로 한글 stdin 안전

## 우리가 처음부터 잘못했던 것 (회고)

1. **서버 버전 시스템을 처음부터 안 만든 것** — 옛 코드 도는지 한눈에 알 수 있었으면 5/19에 끝났을 문제
2. **자동 재시작 인프라를 늦게 만든 것** — Codex 진단 받고 나서야
3. **HTTP 단일 요청 구조의 한계를 늦게 인정한 것** — 360s/600s timeout 늘리기로 시간 끌면서 본질 해결(background job) 미룸
4. **사장님 환경 검증 부족** — 매번 패치 후 사장님 서버 상태를 자동으로 확인하지 않음

## .gitignore 함정 (별도 발견)

도메인 `.gitignore`에 `output/` 들어있어 `output/prompt_*.md` 파일들이 어제 사라져도 git 이력에 없었음. 사장님 PC에만 보관되고 추적 안 됨.

향후: 중요한 카피·결과물은 `memory/`(추적됨) 또는 별도 폴더로.

## 검증 통과

- syntax: server.js / app.js OK
- 새 서버 v0.5.3 정상 부팅
- `/api/health` 응답에 `server.version: v0.5.3-2026-05-20`, `claude_timeout_ms: 360000` 정상
- `/api/jobs/<없는id>` 404 정상
- claude_cli ok v2.1.126

## 사장님이 앞으로 할 일

- 코드 패치 후 → **`서버 재시작.bat` 더블클릭** (한 번에 옛 서버 종료 + 새 부팅 + health 확인)
- 또는 `상세페이지 제작기.html` 옆에 있는 `code/start_hidden.vbs` 더블클릭 (조용히 자동)
- 브라우저는 Ctrl+F5

## 다음 라운드 후보 (사장님 실 사용 후 발견 시)

1. prompt 분할 생성 (큰 입력 임계값) — Codex 추천이지만 현재는 background job만으로 충분할 것
2. job 상태 IndexedDB 저장 (브라우저 새로고침 시 복원)
3. git_commit hash를 SERVER_VERSION에 포함 (이번엔 정적 문자열)
