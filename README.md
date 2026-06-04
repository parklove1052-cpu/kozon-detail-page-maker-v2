# 코존 상세페이지 제작자

코존코리아 사장님 전용 상세페이지 제작 로컬 도구. Claude CLI를 호출해 카피·기획·HTML을 생성하고, Playwright로 페이지별 JPEG 분할까지 자동화합니다.

---

## 1. 새 PC 빠른 설치 (Windows 기준)

### ✅ 사전 준비물

1. **Node.js 18 이상** — https://nodejs.org/ (LTS 권장)
2. **Git** — https://git-scm.com/
3. **Claude Code CLI (`claude` 명령)** — https://docs.claude.com/en/docs/claude-code/setup
   - 설치 후 `claude --version`이 PowerShell에서 동작해야 합니다.
4. **GitHub 계정** — 이 repo에 접근 가능해야 합니다 (private repo면 인증 필요).

### 📥 클론 위치 (중요)

`code/config.json`에는 도메인 루트의 **절대경로 10곳**이 박혀 있습니다. 다음 두 가지 중 하나를 선택하세요.

#### 방법 A — 동일 경로에 클론 (권장, 무수정)

기존 PC와 **똑같은 경로**에 클론하면 config 수정이 전혀 필요 없습니다:

```powershell
# 폴더 만들기 (없으면)
New-Item -ItemType Directory -Force -Path "C:\Users\MYCOM\Documents\조현준편집파일 329부터\클로드코드\코존워크스페이스\domains" | Out-Null

cd "C:\Users\MYCOM\Documents\조현준편집파일 329부터\클로드코드\코존워크스페이스\domains"

git clone https://github.com/parklove1052-cpu/kozon-detail-page-maker-v2.git "상세페이지 제작자"
```

⚠️ 새 PC 사용자명이 `MYCOM`이 아니어도 위 경로를 그대로 만들면 동작합니다 (Windows는 사용자 폴더와 무관하게 임의 경로 사용 가능).

#### 방법 B — 다른 경로에 클론 + config 자동 치환

다른 경로에 두고 싶다면 클론 후 `install.bat`를 실행하세요. `config.json`의 절대경로를 현재 PC의 실제 경로로 자동 치환합니다.

```powershell
git clone https://github.com/parklove1052-cpu/kozon-detail-page-maker-v2.git "상세페이지 제작자"
cd "상세페이지 제작자"
.\install.bat
```

### ⚙️ 의존성 설치 & 첫 실행

```powershell
cd code
npm install
node server.js
```

브라우저에서 http://127.0.0.1:7777 접속 → 사용 시작.

종료: 서버 터미널에서 `Ctrl+C`.

### 🤖 Claude Code 한 줄 셋업 (권장)

`install.bat` 대신 **Claude Code 에게 셋업을 맡기는 방식**이 더 안전합니다 (인증·로그인까지 챙김).

```powershell
# 클론한 폴더에서
claude
```

그리고 첫 입력 한 줄만:

> **SETUP_FOR_CLAUDE.md 보고 셋업 진행해줘**

→ Claude Code 가 `scripts/setup.mjs` + `scripts/check-auth.mjs` 를 자동 실행하고,
Higgsfield/Claude CLI/GitHub 인증 같은 **사장님이 직접 해야 하는 단계** 만 사장님께 안내합니다.

자세한 절차는 [SETUP_FOR_CLAUDE.md](./SETUP_FOR_CLAUDE.md) 참조.

### 🖱️ 평생 자동 — 시작 프로그램 1회 등록 (권장)

**최초 1회만** 도메인 폴더의 **`서버 자동시작 등록.bat`**을 더블클릭하세요.
- Windows 시작 프로그램에 `code/start_hidden.vbs` 단축키를 자동 등록합니다.
- 다음부터는 PC 켤 때마다 서버가 자동으로 떠 있고, 사장님은 그냥 **`상세페이지 제작기.html`** 만 더블클릭하면 즉시 사용 가능합니다.
- 해제하려면 **`서버 자동시작 해제.bat`** 더블클릭.

### 단발성 실행 (선택)

자동 등록 안 하시려면:
- `code/start_hidden.vbs` 더블클릭 (지금 1회만 hidden 서버 띄우기)
- `서버 재시작.bat` 더블클릭 (콘솔에서 부팅 에러 메시지를 직접 보고 싶을 때)

---

## 2. 두 PC 양방향 동기화 워크플로우

⚠️ **메모리(`memory/`)와 CLAUDE.md, `.claude/agents/` 는 양쪽 PC에서 변경되므로 충돌 주의**.

```powershell
# (작업 시작 전) 다른 PC에서 작업한 게 있나 가져오기
git pull

# (작업 후) 변경 푸시
git add -A
git commit -m "작업 설명"
git push
```

권장:
- **세션 시작 = `git pull` 먼저**
- **세션 종료 = `git add -A && git commit && git push`**

충돌 발생 시:
- 메모리 파일은 양쪽 내용을 사람이 보고 병합 (자동 머지 금지)
- 결과물(`output/`, `code/uploads/`)은 어차피 .gitignore라 충돌 안 남

---

## 3. 구조

```
상세페이지 제작자/                     ← repo 루트
├── CLAUDE.md                          ← 도메인 규칙 (절대 준수, HTML 기본 지침)
├── README.md                          ← 이 파일
├── install.bat                        ← 새 PC 자동 셋업 (config 경로 치환 + npm install)
├── .gitignore
├── 상세페이지 제작기.html              ← 더블클릭 진입점
│
├── code/                              ← Node 서버 + UI
│   ├── server.js                      ← 메인 서버 (Claude CLI spawn)
│   ├── config.json                    ← 포트/스타일/도메인 경로 ⚠️절대경로 박힘
│   ├── package.json
│   ├── public/                        ← UI (index.html, app.js, style.css)
│   ├── scripts/                       ← 보조 스크립트
│   ├── start_hidden.vbs               ← 백그라운드 시작
│   ├── 서버 재시작.bat                  ← 서버 재시작
│   └── _restore.mjs                   ← _last_prompt 재실행 복원 도구
│
├── memory/                            ← 도메인 메모리 (절대 자동 변형 X)
├── .claude/agents/                    ← 도메인 전용 에이전트 5종
├── benchmarks/                        ← 레퍼런스 분석 산출물
├── references/                        ← 레퍼런스 원본 자료
└── fonts/                             ← 폰트 자산 (Pretendard 등)
```

`.gitignore`로 제외되는 폴더:
- `code/uploads/` (사용자 업로드, 큼)
- `code/output/`, `output/`, `상세제작결과/` (생성 결과물, 매우 큼)
- `code/node_modules/`
- `code/.playwright-mcp/`, `code/.playwright-profile/` (브라우저 캐시)

---

## 4. 주의사항

### ⚠️ 사장님 카피·메모리 보호
- `memory/*.md` 와 `CLAUDE.md`, `.claude/agents/*.md` 는 사장님의 운영 지침입니다. **자동화 도구로 함부로 덮어쓰지 마세요.**
- 양 PC 모두 같은 git을 보고 있으므로 한쪽에서 메모리 수정 → 다른쪽 pull 시 반영됩니다.

### ⚠️ Claude CLI 동작 확인
- `node server.js` 실행 후 첫 호출에서 timeout이 나면 `claude --version` 부터 점검하세요.
- 서버는 Claude CLI를 `cmd.exe /c chcp 65001 & claude ...` 로 spawn합니다 (UTF-8 한글 깨짐 우회).

### ⚠️ Playwright 브라우저
- 첫 실행 시 `npx playwright install chromium` 가 필요할 수 있습니다 (`install.bat`가 자동 처리).

### ⚠️ Windows 한글 경로
- 폴더명에 한글이 포함됩니다 (`상세페이지 제작자`, `조현준편집파일 329부터` 등). PowerShell/cmd는 UTF-8 설정에서 사용하세요.

---

## 5. 버전 / 정보

- 현재 버전: **v0.5.6** (메모리: `memory/project_v0.5.6_html_restore_tools_block.md` 참조)
- 운영자: 코존코리아 사장님 (parklove1052@gmail.com)
- 사용 기술: Node.js 내장 모듈 중심 + playwright + sharp + archiver, Claude CLI spawn

상세 변경 이력은 `memory/INDEX.md` 의 `project_v0.*` 시리즈 참조.

---

## 6. 라이선스

사장님 개인 운영용. 외부 배포 금지.
