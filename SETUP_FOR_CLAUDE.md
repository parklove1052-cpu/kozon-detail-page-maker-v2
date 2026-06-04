# SETUP_FOR_CLAUDE.md

> **이 파일은 Claude Code (CLI) 가 다른 PC에서 처음 이 repo를 받아 셋업할 때 따라할 절차서입니다.**
>
> **사용자(코존코리아 사장님) 사용법**: 새 PC에서 이 repo를 클론한 뒤 폴더에서 `claude` 실행 → 한 줄만 입력:
>
> > **"SETUP_FOR_CLAUDE.md 보고 셋업 진행해줘"**
>
> 이 파일을 받은 Claude Code 는 아래 절차를 **위에서 아래로 순서대로** 따라가면 됩니다.

---

## 0. Claude Code 행동 규칙 (먼저 읽기)

이 셋업은 **Claude Code 가 직접 실행** 하되, **인증·로그인 단계는 사장님이 직접** 처리합니다 (보안상 Claude Code 가 credential 입력 X).

| Claude Code 가 직접 할 일 | 사장님께 안내해서 시킬 일 |
|---|---|
| `node scripts/setup.mjs --json` 실행 | `claude` 첫 로그인 |
| `node scripts/check-auth.mjs --json` 실행 | `higgsfield auth login` |
| 결과 JSON 파싱해서 nextActions 정리 | `gh auth login` (선택) |
| `code/config.json` 경로 자동 치환 | Node.js 설치 (만약 없으면) |
| `code/uploads/.gitkeep` 등 dir 보장 | Higgsfield CLI 설치 (만약 없으면) |
| 사장님께 진행 상황 보고 | 필요 시 인증/설치 명령 직접 실행 |

**핵심**: Claude Code 는 매 단계 후 **사장님이 직접 처리해야 하는 명령이 있다면 한국어 정중체로 명시적으로 안내**합니다. 임의로 사장님 credential 을 입력하거나 인증 명령을 자동 실행하지 마세요.

---

## 1. 현재 상태 빠른 점검 (Claude Code 가 자동 실행)

```bash
# 1) 도메인 루트인지 확인 (현재 디렉토리에 CLAUDE.md, code/, scripts/ 가 있어야 함)
ls
```

기대 결과: `CLAUDE.md`, `README.md`, `SETUP_FOR_CLAUDE.md`, `code/`, `scripts/`, `memory/`, `.claude/` 가 보여야 함.

보이지 않는다면 사장님께 "현재 디렉토리가 repo 루트가 아닌 것 같습니다. `상세페이지 제작자` 폴더로 이동 후 다시 시작해주세요" 라고 보고하고 중단.

---

## 2. 자동 셋업 (Claude Code 가 직접 실행)

```bash
node scripts/setup.mjs --json
```

이 스크립트는 다음을 자동 처리합니다:
1. Node.js 18+ 버전 체크
2. `code/config.json` 의 절대경로를 **현재 PC 의 실제 경로** 로 자동 치환
3. `code/` 에서 `npm install`
4. `npx playwright install chromium`

**Claude Code 가 할 일:**
- 위 명령을 실행
- 출력 마지막 JSON 의 `ok` 필드 확인:
  - `true` → 다음 단계로
  - `false` → JSON 의 `nextActions` 배열 내용을 사장님께 한국어로 정리해서 안내

**예시 안내 멘트:**
> "사장님, 자동 셋업 결과 Node.js 가 설치되지 않은 것 같습니다. https://nodejs.org/ 에서 LTS 버전을 설치하신 후 다시 `setup.mjs` 를 실행해주세요. 설치 완료되면 알려주세요."

---

## 3. 인증 상태 점검 (Claude Code 가 직접 실행)

```bash
node scripts/check-auth.mjs --json
```

이 스크립트는 다음 항목의 설치·인증 상태를 점검합니다:

| 항목 | 레벨 | 용도 |
|---|---|---|
| Node.js | 필수 | 서버 실행 |
| npm | 필수 | 의존성 |
| Claude Code CLI (`claude`) | 필수 | 카피·HTML 생성 (server.js 가 spawn 함) |
| Higgsfield CLI (`higgsfield`) | 권장 | 이미지/영상 생성 (글로벌 스킬 호출용) |
| GitHub CLI (`gh`) | 권장 | repo pull/push |

**Claude Code 가 할 일:**
- 위 명령을 실행
- 출력 JSON 의 `nextActions` 배열을 보고, **사장님이 직접 실행해야 할 명령** 을 정리해서 한국어로 안내

### 인증/설치 안내 표준 멘트

각 항목별로 사장님께 다음 톤으로 안내합니다:

#### Claude Code CLI 없음
> "사장님, 이 시스템의 카피·HTML 생성은 Claude Code CLI 를 사용합니다.
> 다음 링크를 보고 설치해주세요: https://docs.claude.com/en/docs/claude-code/setup
> 설치 후 PowerShell에서 `claude --version` 이 동작하는지 확인해주세요.
> 첫 실행 시 로그인 안내가 뜨면 사장님 Anthropic 계정으로 로그인하시면 됩니다.
> 완료되면 알려주세요. 점검을 다시 돌리겠습니다."

#### Higgsfield CLI 없음
> "사장님, 이미지/영상 생성 기능을 사용하시려면 Higgsfield CLI 가 필요합니다.
> 다음 명령을 사장님 PowerShell에서 직접 실행해주세요:
>
> ```
> npm install -g @higgsfield-ai/cli
> higgsfield auth login
> ```
>
> 사장님 Higgsfield Plus 구독 계정으로 로그인해주시면 됩니다.
> 완료되면 알려주세요."

#### Higgsfield 설치됨, 로그인 안 됨
> "사장님, Higgsfield CLI 는 설치되어 있지만 로그인이 안 되어 있습니다.
> PowerShell 에서 다음을 실행해주세요:
>
> ```
> higgsfield auth login
> ```
>
> 사장님 Higgsfield Plus 구독 계정으로 로그인 후 알려주세요."

#### GitHub CLI 없음 (선택)
> "사장님, GitHub CLI 는 필수는 아니지만, 설치하시면 두 PC 간 동기화 (`git pull`/`push`) 가 편해집니다.
> 설치를 원하시면: https://cli.github.com/
> 일단 다음 단계로 진행해도 됩니다."

---

## 4. 사장님 확인 후 재점검

사장님이 "다 했어" 또는 "설치 완료" 같이 답하시면:

```bash
node scripts/check-auth.mjs --json
```

다시 실행해서 모든 **필수 항목** 이 `ok` 인지 확인. **권장 항목** 은 사장님이 안 쓰겠다고 하시면 missing 이어도 OK.

---

## 5. 서버 시작 안내

모든 필수 항목 OK 이면, 사장님께 다음과 같이 안내:

> "사장님, 셋업이 완료되었습니다. 이제 두 가지 방법으로 서버를 시작할 수 있습니다:
>
> **방법 1 — 일회성 실행 (지금 바로 테스트)**
> ```
> cd code
> node server.js
> ```
> → 브라우저에서 http://127.0.0.1:7777 접속
>
> **방법 2 — 평생 자동 시작 (권장)**
> 도메인 루트의 `서버 자동시작 등록.bat` 을 더블클릭하시면 Windows 시작 프로그램에 등록됩니다.
> 다음부터 PC 켤 때마다 서버가 자동으로 떠 있어서, 사장님은 `상세페이지 제작기.html` 만 더블클릭하시면 즉시 사용 가능합니다.
>
> 어느 방법으로 진행하시겠어요?"

---

## 6. 셋업 완료 후 사장님께 보고할 체크리스트

```
✅ Node.js 버전 확인
✅ code/config.json 경로 자동 치환
✅ npm install 완료
✅ Playwright Chromium 설치
✅ Claude Code CLI 인증
✅ Higgsfield CLI 설치/인증 (사용 시)
✅ GitHub CLI (선택)
✅ 서버 시작 방법 안내
```

각 항목을 OK/SKIP/FAIL 로 정리해서 한 번에 보고. 빠진 게 있으면 다음 단계 명시.

---

## 7. 트러블슈팅 (Claude Code 가 사장님 질문 받았을 때 참고)

### "서버가 안 떠요"
1. `code/server.js` 실행 시 에러 메시지 그대로 사장님께 보여드리기
2. 흔한 원인:
   - 포트 7777 충돌 → `code/config.json` 의 `port` 값을 변경 (예: 7778)
   - `code/config.json` 의 절대경로가 현재 PC 와 안 맞음 → `node scripts/setup.mjs --skip-npm --skip-playwright` 로 경로 재치환
   - `claude` CLI 미설치 → check-auth.mjs 재실행

### "Higgsfield 생성이 실패해요"
1. `higgsfield auth status` 사장님께 실행 요청 — 만료된 토큰일 수 있음
2. Plus 구독 만료 가능성도 사장님께 안내
3. `code/config.json` 의 `higgsfield_mode` 가 `"claude"` 면 글로벌 스킬 위임 (CLAUDE.md 참고), `"cli"` 면 직접 spawn

### "한글이 깨져요"
1. 사장님 PowerShell 이 UTF-8 인지 확인 — `chcp 65001` 실행
2. 시스템 설정 → 언어 설정 → 베타: UTF-8 사용 켜기 (Windows 10/11)

### "기존 PC 의 작업 가져오기"
```
git pull
```
충돌 발생 시 사장님께 알리고 자동 머지 절대 X. memory/ 파일은 사람이 보고 병합.

---

## 8. 자주 묻는 질문 (Claude Code 도 참고)

**Q. 사장님이 "Higgsfield 설치는 안 할래" 라고 하시면?**
A. `code/config.json` 의 `higgsfield_mode` 를 `"claude"` 로 두고 진행. Claude Code 글로벌 스킬(`/higgsfield:generate` 등) 이 호출을 처리합니다. CLI 가 없어도 동작합니다.

**Q. 사장님이 다른 폴더 경로에 클론하셨다면?**
A. `node scripts/setup.mjs` 가 `config.json` 의 절대경로를 자동으로 현재 PC 경로로 치환합니다. 사장님이 별도로 손댈 필요 없음.

**Q. 새 PC 의 사용자명이 `MYCOM` 이 아니어도 되나?**
A. 완전히 무관합니다. `setup.mjs` 가 현재 PC 의 실제 경로를 그대로 박아넣습니다.

**Q. 이 셋업을 두 번 돌려도 되나?**
A. 안전합니다. 멱등(idempotent) 하게 설계되어 있어 여러 번 돌려도 결과 동일.

---

## 9. 사장님 안전 규칙 (Claude Code 절대 위반 X)

- `memory/`, `CLAUDE.md`, `.claude/agents/`, `settings.json` **자동 수정·삭제 금지** (사장님 운영 지침이므로)
- 사장님 credential (Anthropic API key, Higgsfield 토큰 등) **저장·조회 시도 금지**
- `git push --force`, `git reset --hard`, `rm -rf` **명시 지시 없으면 금지**
- 셋업 중 에러 발생 시 **임의 우회 금지** — 사장님께 상황 보고하고 지시 대기

---

## 10. 한 줄 요약 (다른 PC Claude Code 가 받을 명령)

```
SETUP_FOR_CLAUDE.md 보고 셋업 진행해줘
```

→ Claude Code 는 이 파일의 §1 → §2 → §3 → §4 → §5 → §6 순으로 진행하면서 사장님께 한국어 정중체로 보고.
