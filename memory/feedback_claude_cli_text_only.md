---
name: claude CLI 텍스트 응답 강제 — --tools "" + prompt 가드 동시 적용
description: 상세페이지 HTML 생성처럼 "순수 텍스트만 받아야 하는" CLI 호출은 --tools "" 와 prompt 안 "도구 사용 절대 금지" 가드를 동시 적용. 어느 한쪽만 두면 claude가 Write 도구로 직접 저장 시도 → "권한 거부" 메시지가 본문 자리에 나옴.
type: feedback
---

## 규칙

상세페이지 HTML 등 **텍스트로만 받아야 하는 claude CLI 호출**은 다음 둘을 동시 적용한다:

1. **spawn 명령에 `--tools ""` 추가**
   ```js
   spawn('cmd.exe', ['/c', 'chcp 65001 >nul && claude -p --output-format text --tools ""'], ...)
   ```
2. **prompt 출력 규칙에 강제 가드**
   ```
   🚫 도구 사용 절대 금지: 이 작업은 순수 텍스트 응답만 받습니다.
   Write·Edit·Bash·MultiEdit·NotebookEdit·Read·Glob·Grep·WebFetch·WebSearch·Task·TodoWrite
   어떤 도구도 호출하지 마세요. 결과는 ```html ... ``` 코드 블록 한 덩어리로만.
   ```

## Why

2026-05-25 ROCKMAN ZERO 향수 상세페이지 생성 시 사장님이 HTML 대신 "**경로 쓰기 권한이 거부되어 저장이 안 됩니다…**" 안내 텍스트(918 byte)를 받음. 원인:

- claude가 `Write` 도구로 HTML을 직접 파일 저장하려 함
- 도메인 폴더가 권한 차단되어 실패
- 응답에는 실패 안내만 텍스트로 남고, **실제 HTML은 아예 생성되지 않음**
- 사장님 입장에서는 "HTML 받았다" 착각 → 새로고침 후 사라짐 (실체가 없음)

`--tools ""` 만 두면 cmd.exe escape 깨져 `claude` 명령 자체가 죽고(`spawn cmd.exe ENOENT`/`지정된 경로를 찾을 수 없습니다`), prompt 가드만 두면 claude가 무시하고 Write 시도. **두 방어를 동시에** 두어야 안전.

## How to apply

- 적용 대상: server.js `callClaude`, `_restore.mjs`, 그 외 claude를 spawn하는 모든 백엔드 스크립트
- 적용 X 대상: claude가 실제 도구를 써야 하는 워크플로우(에이전트·코드 작성). 그건 기본값 유지.
- 검증: 빈 prompt에 짧은 텍스트 응답이 정상으로 돌아오면 OK. exit code 1 + stdout 140자 같은 패턴이 나오면 escape 문제.

## 진단 패턴

| 증상 | 의심 |
|---|---|
| HTML 자리에 "경로 쓰기 권한이 거부..." | claude가 Write 시도 — `--tools ""` 누락 또는 prompt 가드 누락 |
| stdout 짧음 (수백 자) + exit 1 | claude가 도구 호출하다 차단되어 안내 텍스트만 출력 |
| spawn cmd.exe ENOENT | cmd /c 인자에 빈 따옴표(`""`) escape 깨짐 — Git Bash 인라인 -e 환경 |
| 정상 텍스트 응답 (수십 KB) | 두 방어 모두 적용 + claude가 prompt 가드 준수 |

## 검증된 호출 형태

```js
const proc = spawn('cmd.exe',
  ['/c', 'chcp 65001 >nul && claude -p --output-format text --tools ""'],
  { cwd: codeDir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
```

2026-05-25 ROCKMAN ZERO 향수 11섹션 20.8KB HTML 정상 응답으로 검증 완료.
