---
name: 상세페이지 제작자 v0.5.5 — Job 취소/heartbeat + render-jpeg·extract background job 전환
description: Codex 진단 미반영 3건(1-2 job 취소·6-1 render-jpeg job·6-2 extract job) 모두 처리. 페이지 닫기 시 navigator.sendBeacon으로 서버 job 자동 취소, claude proc 강제 종료 가능. 모든 LLM·렌더 작업이 일관된 background job 패턴.
type: project
---

# v0.5.5 (2026-05-22)

## 마무리: Codex 진단 미반영 3건 종결

| Codex # | 항목 | 패치 |
|---|---|---|
| 1-2 | job 취소·heartbeat 부재 | `cancelJob()` + `lastHeartbeat` + 30초 무응답 자동 취소 + POST `/api/jobs/:id/cancel` + 클라 `sendBeacon` |
| 6-1 | `/api/render-jpeg` 동기 zip 스트리밍 | background job 전환. zip 임시 파일 → `download_url`로 다운로드 |
| 6-2 | `/api/extract` 동기 + timeout 불일치 | background job 전환. 클라 polling 통일 |

## 핵심 변경

### A. Job 시스템 강화 (`code/server.js`)

**job 객체 확장**:
- `proc`: 실행 중 spawn된 자식 프로세스 참조 (callClaude·playwright에서 등록)
- `cancelled`: 외부 cancel 요청 받았는지
- `lastHeartbeat`: 마지막 polling 시각 (GET /api/jobs/:id 시 자동 갱신)
- `onCancel`: worker가 등록한 정리 콜백
- ID: `crypto.randomBytes(16)` (128-bit, Codex 1-4)

**cancelJob(job, reason)** 신규:
- state를 `cancelled`로 마킹
- Windows: `taskkill /T /F /PID <proc.pid>` (프로세스 트리 전체)
- POSIX: `proc.kill('SIGTERM')`
- onCancel 콜백 실행 (render-jpeg는 browser.close 등)

**heartbeat 감시 (10초마다)**:
- running job 중 `lastHeartbeat`가 30초 전이면 자동 cancel
- 클라가 페이지 닫고 sendBeacon 도 실패한 경우 안전망

**라우트**:
- `GET /api/jobs/:id` — polling 자체가 heartbeat 갱신
- `POST /api/jobs/:id/cancel` — 외부 cancel 요청
- `GET /api/jobs/:id/download` — render-jpeg 결과 zip 다운로드
- `/api/health` 응답에 `jobs: {total, queued, running, done, failed, cancelled}` 추가

### B. render-jpeg job 전환

**이전**: 동기 zip 스트리밍 (`sendZipResponse`)으로 5분 한도
**이제**: `createJob('render-jpeg')` 즉시 job_id 반환 → 백그라운드 playwright+sharp+archiver 실행 → zip 임시 파일 저장 → `job.result.download_url`
**취소 안전**: job.cancelled 체크 + browser.close 등록 (`onCancel`)

### C. extract job 전환

`handleExtract`도 동일 패턴. 클라 `callExtract`도 `pollJob`.

### D. 클라 (`code/public/app.js`)

**활성 job 추적**:
- `activeJobs = new Set()`, `registerActiveJob/unregisterActiveJob`
- 모든 callPlan / callGenerate / callDirectGenerate / downloadJPEG / callExtract 흐름에서 등록/해제

**페이지 닫기 시 sendBeacon**:
- `window.addEventListener('pagehide', cancelActiveJobsBeacon)`
- `window.addEventListener('beforeunload', cancelActiveJobsBeacon)`
- `navigator.sendBeacon('/api/jobs/:id/cancel', '')` — 페이지 unload 중에도 보장되는 fire-and-forget POST

**downloadJPEG**: job_id 받고 polling → `download_url`로 zip blob fetch → 다운로드
**callExtract**: job_id 받고 polling → output 받음

## 효과

- ⚡로 작업 중 사장님이 실수로 페이지 닫아도 → 서버가 즉시 claude·playwright 프로세스 종료 → 메모리·CPU 낭비 X
- 사장님이 의도적으로 취소하고 싶으면 — 차후 UI에 "취소" 버튼 추가 가능 (현재는 페이지 닫기로만)
- 모든 LLM·렌더 작업이 동일 패턴: POST → job_id → polling → done/failed/cancelled
- 호환성: job_id 없는 옛 응답도 처리 (fallback)

## 가상 테스트 통과

- syntax: server.js / app.js OK
- 15개 식별자 (cancelJob·heartbeat·serveJobDownload·render-jpeg createJob·extract createJob·jobRef.proc·JOBS 통계·sendBeacon 등)
- `/api/health` → `version: v0.5.5+<commit>`, `jobs` 통계 노출
- `/api/jobs/<id>` `/cancel` `/download` 모두 404 정상 (없는 id)

## 다음 라운드 후보 (필요 시)

- UI에 "작업 취소" 버튼 (현재는 페이지 닫기만)
- job 상태 IndexedDB 저장 (브라우저 새로고침 시 복원)
- 다중 동시 job 진행 표시 (현재는 inflight 가드로 막힘 — 의도 유지)
