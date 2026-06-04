# Claude Design 종합 자료 (2026-05-12 기준)

> 자료 출처: Anthropic 공식 지원센터, TechCrunch, VentureBeat, MacRumors, Lenny's Newsletter,
> Jane Street Blog, DesignSystemsCollective, MindStudio, GitHub 오픈소스, 국내 블로그 종합 정리.
> 작성 목적: 상세페이지 제작자 도메인에서 Claude Design을 실무 활용하기 위한 사전 지식 베이스.

---

## 1. 한 줄 정의

**Claude Design은 "프롬프트 → 인터랙티브 프로토타입/슬라이드/원페이저" 자동 생성 도구.**
Anthropic Labs가 2026-04-17 출시. Claude Opus 4.7 기반. claude.ai/design 접속.

## 2. 출시 & 접근

| 항목 | 내용 |
|---|---|
| 출시일 | 2026-04-17 |
| 상태 | Research Preview (정식 GA 아님 — 변경 가능) |
| 엔진 | Claude Opus 4.7 |
| URL | https://claude.ai/design |
| 지원 플랜 | Pro($20/mo), Max($100~$200/mo), Team($25/seat), Enterprise |
| Free 플랜 | ❌ 미지원 |
| Enterprise | 기본 OFF, 관리자가 명시적으로 켜야 함 |
| **사장님 현재 상황** | Max 플랜 보유 → 즉시 사용 가능 |

## 3. 핵심 기능 5가지

### 3.1 프롬프트 → 즉시 렌더링
"명상 앱 홈 화면, 미스티 블루 톤, 일일 트래커 포함" 같은 텍스트 한 줄 → 수 초 내 클릭 가능한 HTML 프로토타입 생성. 정적 목업이 아닌 **실제 작동하는 라이브 HTML**.

### 3.2 디자인 시스템 자동 학습 (가장 큰 차별점)
온보딩 시 우리 코드베이스(GitHub repo) + Figma 파일 + 슬라이드 덱 + PDF + 스크린샷 업로드 → Claude가 다음을 자동 추출:
- 브랜드 컬러 팔레트
- 타이포그래피
- 스페이싱 토큰
- 컴포넌트 패턴
- 보이스(톤앤매너)

이후 **조직 내 모든 새 프로젝트가 이 디자인 시스템을 기본 적용**.
→ Lovable, v0, Figma Make 같은 경쟁사들은 이걸 네이티브로 못 함.

### 3.3 4가지 입력 방법
1. **텍스트 프롬프트** (기본)
2. **이미지/문서 업로드** — DOCX, PPTX, XLSX, PNG, JPG, PDF
3. **코드베이스 연결** — GitHub repo URL 또는 zip 업로드 → 컴포넌트/스타일 직접 읽음
4. **웹 캡처 도구** — 우리 웹사이트 URL 넣으면 요소 직접 그래빙

### 3.4 4가지 수정/리파인먼트 도구
1. **채팅 대화** — 광범위한 변경 ("색감 더 따뜻하게", "위 섹션 재배치")
2. **인라인 코멘트** — 캔버스의 특정 요소 클릭해서 코멘트 ("이 버튼 패딩 8px로")
3. **다이렉트 편집** — 텍스트 클릭해서 직접 수정
4. **슬라이더/노브** — 스페이싱·색상·레이아웃 라이브 조절

### 3.5 Claude Code 핸드오프 번들 ⭐
디자인 완성 → "Send to Claude Code" 버튼 → 자동 패키징:
- 디자인 파일들
- 채팅 히스토리
- **README** (Claude Code가 어떻게 해석할지 지시문 포함)
- 로컬 Claude Code에 붙여넣을 프롬프트 + 번들 URL

**이게 Figma 링크 복붙과 다른 점**: 생성자와 소비자가 같은 시스템(Claude). 디자인 토큰 JSON 같은 표준 위원회 합의가 아니라, **두 Claude 모델 사이에서 최적화된 포맷**.

→ "프로토타입을 코드로 변환하는 번역 단계"가 사라짐.

## 4. UI 구조

```
┌─────────────────────────────┬─────────────────────────────┐
│                             │                             │
│   채팅 패널 (왼쪽)            │   캔버스 (오른쪽)             │
│                             │                             │
│   - 프롬프트 입력             │   - 생성된 디자인 렌더링       │
│   - Claude 응답              │   - 클릭 가능 (라이브)         │
│   - 첨부 파일 업로드          │   - 인라인 코멘트 가능         │
│   - 채팅 히스토리             │   - 다이렉트 편집 가능         │
│                             │                             │
└─────────────────────────────┴─────────────────────────────┘
```

## 5. Export 옵션 5가지 (각각 한계 있음)

| 포맷 | 용도 | 품질 | 주의사항 |
|---|---|---|---|
| **HTML (standalone)** | 웹 미리보기, 이메일 첨부 | ⭐⭐⭐⭐⭐ 최상 | 가장 안정적. 인터랙션 살아있음 |
| **PDF** | 검토/승인, 인쇄 | ⭐⭐⭐⭐ 좋음 | 안정적이지만 편집 어려움 |
| **PPTX (PowerPoint)** | 발표 자료 | ⭐⭐ 불안정 | 폰트 안 따라옴, 그라데이션 깨짐, 이미지 크롭 변형 |
| **Canva** | 추가 편집/마케팅 자산 | ⭐⭐⭐⭐ 좋음 | Brand Kit 자동 적용. 콘텐츠 마케터에게 넘기기 좋음 |
| **Claude Code 핸드오프** | 코드 변환 → 실제 배포 | ⭐⭐⭐⭐⭐ 최상 | Claude Code 세션에 번들 URL 전달 |
| **ZIP 다운로드** | 백업/오프라인 | ⭐⭐⭐⭐ | 전체 자산 일괄 |

**⚠️ 비디오 익스포트 불가**: 애니메이션 만들면 화면 녹화밖에 방법 없음. MP4/MOV 직접 추출 안 됨.

**⚠️ Figma 익스포트 없음**: 단방향(Figma → Claude Design)은 가능, 역방향 불가.

## 6. 디자인 시스템 셋업 (브랜드 일관성의 핵심)

### 6.1 셋업 위치
- 온보딩 시 1회 또는
- 조직 설정에서 언제든 (Settings → Design Systems)

### 6.2 업로드 가능 에셋
- **코드베이스**: React 컴포넌트 라이브러리, CSS, Tailwind 설정 등
- **디자인 파일**: Figma export, Sketch, XD
- **이미지**: 스크린샷, 웹 플로우, 기존 페이지
- **슬라이드/문서**: PPTX, PDF (브랜드를 반영하는 자료라면 OK)

### 6.3 추출되는 것
- 브랜드 컬러 (Primary/Secondary/Accent)
- 타이포그래피 (헤딩/본문 폰트, 사이즈 스케일)
- 스페이싱 토큰 (4px/8px/16px 그리드)
- 컴포넌트 패턴 (버튼/카드/입력 필드 등)
- 레이아웃 룰

### 6.4 갱신
디자인 시스템 변경 시 한 번 업데이트 → Team/Enterprise면 **팀원 전원 자동 적용**.

## 7. 공유/협업

| 옵션 | 권한 |
|---|---|
| Internal URL | 조직 내 누구나 보기 |
| View-only | 보기만 가능 |
| Comment | 코멘트 가능 |
| Edit | 함께 수정 + Claude와 같이 대화 가능 |
| Private | 본인만 |

**⚠️ 멀티플레이어 실시간 편집은 없음** (Figma 같은 동시 커서 없음).

## 8. 한계와 알려진 버그

### 8.1 기능적 한계
- ❌ 멀티플레이어 동시 편집
- ❌ 무한 캔버스
- ❌ 세션 간 영속적 컴포넌트 라이브러리
- ❌ Figma 직접 익스포트
- ❌ 예측 히트맵, 자동 접근성 감사, 사용성 점수 같은 UX 리서치 기능
- ❌ 비디오 MP4/MOV 익스포트

### 8.2 알려진 버그
- 인라인 코멘트가 Claude가 읽기 전에 사라지는 경우 → **채팅에 텍스트 복붙으로 우회**
- Compact 레이아웃 모드에서 저장 에러 → **Full view로 전환 후 재시도**
- 매우 큰 모노레포 연결 시 브라우저 랙 → **서브디렉토리만 링크하기**
- SVG import 패스 깨짐, 다크모드 팔레트 중첩 컴포넌트 미반영 (복구 가능)

### 8.3 성능
- 프롬프트당 4~7분 소요 (4번 돌리면 약 21분)
- Opus 4.7 비전 토큰 = 텍스트의 약 3배 비용
- 복잡한 디자인 세션 2~3번이면 Pro 주간 한도의 상당 부분 소비
- **Max 플랜이라면 큰 문제 없음**

### 8.4 텍스트/콘텐츠 약점
- 콘텐츠 배치, 이미지/일러스트 구분에서 가끔 실수
- 텍스트가 겹치는 경우 발생

## 9. vs Figma 비교

| 항목 | Claude Design | Figma |
|---|---|---|
| 속도 | ⭐⭐⭐⭐⭐ 압도적 (분 단위) | ⭐⭐ 느림 (시간 단위) |
| 정밀 제어 | ⭐⭐ 약함 | ⭐⭐⭐⭐⭐ 강함 |
| 디자인 시스템 학습 | ⭐⭐⭐⭐⭐ 자동 | ⭐⭐ 수동 |
| 실시간 협업 | ⭐ 없음 | ⭐⭐⭐⭐⭐ 강함 |
| 코드 변환 | ⭐⭐⭐⭐⭐ 네이티브 (Claude Code) | ⭐⭐⭐ 플러그인 필요 |
| 비용 | 기존 구독에 포함 | $15/seat 별도 |
| 브랜드 캠페인/패키징 | ❌ 부족 | ⭐⭐⭐⭐⭐ 필수 |
| 빠른 시안/랜딩페이지 | ⭐⭐⭐⭐⭐ 최강 | ⭐⭐⭐ |

**결론**: 디자이너 있는 팀은 Figma 유지. **솔로/소규모는 Claude Design이 충분**.
사장님 케이스(상세페이지 제작자 도메인) = **Claude Design 적합**.

## 10. 프롬프트 베스트 프랙티스

### 10.1 좋은 프롬프트 구조
1. **목표** (무엇을 만들지)
2. **레이아웃** (구조/섹션)
3. **콘텐츠** (텍스트/이미지 종류)
4. **타깃 오디언스** (누가 볼 것인지)
5. **톤/브랜드 톤** (분위기)

### 10.2 예시
**나쁜 예**: "상세페이지 만들어줘"

**좋은 예**:
```
코존코리아 신상 [무선이어폰] 상세페이지를 만들어줘.
- 타깃: 20~30대 직장인, 출퇴근 시 사용
- 섹션: 히어로 → USP 3가지 → 사용 시나리오 → 스펙 → 후기 → 구매 CTA
- 톤: 미니멀, 신뢰감, 한국어
- 모바일 우선 (네이버 스토어 기준)
- 컬러: 화이트 베이스 + 포인트 다크그레이
- 제품 사진 자리는 placeholder로 표시
```

### 10.3 반복 수정 팁
- **광범위 변경**: 채팅으로 ("전체 톤을 더 프리미엄하게")
- **국소 변경**: 인라인 코멘트로 (특정 버튼 클릭 → "패딩 12px")
- **방향 전환**: "지금 버전 저장하고 완전히 다른 접근 시도해줘"
- **참조 자료 첨부**: 경쟁사 페이지 스크린샷 첨부하며 "이 톤으로"

## 11. 오픈소스 대안 (참고용)

Claude Design이 클로즈드 소스라서 오픈소스 대안들 등장:

| 프로젝트 | URL | 특징 |
|---|---|---|
| **Open Design (nexu-io)** | github.com/nexu-io/open-design | 로컬 우선, 19 Skills, 71 디자인 시스템, MIT |
| **Open CoDesign** | github.com/OpenCoworkAI/open-codesign | BYOK, 12개 디자인 스킬, 멀티 모델(Claude/GPT/Gemini) |
| **awesome-claude-design** | github.com/rohitg00/awesome-claude-design | DESIGN.md 프롬프트 모음 + 레시피 + 커뮤니티 평가 |
| **63 Design Skills** | Marie-Claire Dean 공개 | Claude Code용 디자인 스킬 63개 + 27개 커맨드 |

→ **상세페이지 제작자 도메인에 GitHub의 Design Skills를 설치하면 Claude Code 단독으로도 디자인 능력 확장 가능**.

## 12. 상세페이지 제작자 도메인 추천 워크플로우

### 12.1 첫 셋업 (1회만)
1. claude.ai/design 접속 (Max 로그인)
2. **조직 디자인 시스템 셋업**:
   - 코존코리아 기존 페이지 스크린샷 5~10장 업로드
   - 이브덴메모리 / 미니멀리스트랩스 브랜드 자료도 별도 시스템으로 등록
   - 추출된 컬러/폰트/스페이싱 검수 → 보완 업로드
3. 브랜드별 시스템 3개 완성

### 12.2 일상 워크플로우 (제품마다)
```
[1] 사장님: 신상 제품 정보 정리 (스펙/사진/USP)
        ↓
[2] claude.ai/design: 프롬프트 + 브랜드 시스템 자동 적용
        → 시안 A안 생성 (4~7분)
        ↓
[3] 사장님: 인라인 코멘트로 수정 (제품 사진 위치 등)
        → 시안 최종본
        ↓
[4] Export: 핸드오프 번들 → Claude Code (상세페이지 제작자 세션)
        ↓
[5] Claude Code: HTML 변환 → 이미지 슬라이스 → 네이버 스마트스토어 업로드 포맷 변환
        ↓
[6] 네이버 스토어 업로드 (스토어자동화 도메인 연계)
```

### 12.3 절약 효과 추정
- 기존: 상세페이지 1개 = 4~8시간 (시안 제작 + 디자이너 외주 or 직접 작업)
- Claude Design 도입: 1개 = 30분~1시간 (프롬프트 + 수정 + 코드 변환)
- 월 신상 5개 가정 시 **약 20~40시간/월 절약**

## 13. 향후 사장님 액션 아이템

- [ ] **즉시**: claude.ai/design 접속해서 첫 프로토타입 1개 만들어보기 (탐색)
- [ ] **이번 주**: 코존코리아 브랜드 디자인 시스템 1개 셋업
- [ ] **다음 주**: Playwright MCP로 Claude Code → Claude Design 자동 조작 셋업 (별도 메모리 참조 예정)
- [ ] **2주 후**: 실제 신상 1건으로 풀 워크플로우 검증
- [ ] **GitHub의 design skills 패키지 설치 검토** (Claude Code 자체 디자인 능력 강화)

## 14. 참고 자료

### 공식
- [Claude Design 시작하기 (한국어)](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)
- [디자인 시스템 셋업](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design)
- [Team/Enterprise 관리자 가이드](https://support.claude.com/en/articles/14604406-claude-design-admin-guide-for-team-and-enterprise-plans)
- [Anthropic 공식 발표](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [공식 튜토리얼: 프로토타입과 UX](https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux)

### 보도
- [TechCrunch 출시 기사](https://techcrunch.com/2026/04/17/anthropic-launches-claude-design-a-new-product-for-creating-quick-visuals/)
- [VentureBeat: Figma 도전](https://venturebeat.com/technology/anthropic-just-launched-claude-design-an-ai-tool-that-turns-prompts-into-prototypes-and-challenges-figma)
- [MacRumors](https://www.macrumors.com/2026/04/17/anthropic-claude-design/)

### 심층 분석
- [Lenny's Newsletter: 실제로 뭘 잘하나](https://www.lennysnewsletter.com/p/what-claude-design-is-actually-good)
- [Jane Street: Figma보다 더 쓴다](https://blog.janestreet.com/i-design-with-claude-code-more-than-figma-now-index/)
- [Claude Design → Claude Code 핸드오프 가이드](https://claudefa.st/blog/guide/mechanics/claude-design-handoff)
- [디자이너 풀 워크플로우 (Design Systems Collective)](https://www.designsystemscollective.com/from-prompt-to-production-a-designers-step-by-step-workflow-with-claude-design-claude-code-a7705daad026)
- [익스포트 한계 (Substack)](https://claudedesign.substack.com/p/the-claude-design-mistake-you-dont)

### 한국어
- [Pixso: 접속부터 편집까지 완벽 가이드](https://pixso.net/kr/tips/claude-design-complete-guide/)
- [이랜서 블로그: 디자인 작업 방식이 달라진다](https://www.elancer.co.kr/blog/detail/1075)
- [Gpters: PM·창업자 가이드](https://www.gpters.org/news/post/claude-design-sayongbeob-wanbyeog-jeongri----dijaineo-eobsi-pm-cangeobjaga-FT0hAJo0eifVMAj)

### 오픈소스
- [Open Design (로컬 우선 대안)](https://github.com/nexu-io/open-design)
- [Open CoDesign (멀티모델 BYOK)](https://github.com/OpenCoworkAI/open-codesign)
- [Awesome Claude Design 모음](https://github.com/rohitg00/awesome-claude-design)
- [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills)

### 한계 분석
- [DesignRush: 어디서 멈추나](https://www.designrush.com/agency/design-agencies/trends/what-claude-design-actually-does-and-where-it-stops)
- [UXPilot 리뷰](https://uxpilot.ai/blogs/claude-design-review)

---

**다음 단계**: 이 자료를 토대로 Playwright MCP 연동 셋업 (별도 메모리 작성 예정).
