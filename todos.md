# 상세페이지 제작자 todos

진행 중인 작업 추적.

## In Progress

## Pending

### [v0.8 후속] style.css dead CSS 정리
v0.7 Higgsfield/Inpaint 관련 클래스 통째 제거 (`.approval-card`, `.approval-toolbar`, `.generation-status`, `.inpaint-modal*` 등 L1362-L1710 정도). 현재는 미사용이라 동작 무리 없음 — 한가할 때 청소.

### [v0.9 결정 대기] ChatGPT 이미지 생성 자동 통합 — 4안 비교 완료
2026-06-11 사장님과 정밀 시뮬레이션 완료. 상세는 `memory/handoff_2026-06-11_v0.9_chatgpt_integration.md`.

**4안 비교 결과 요약**:
- A안 (OpenAI API 직접): 비용 $0.66/페이지, 속도 15-25초, 안정성 ★★★★★
- Codex 경유: A안 + 사고 레이어, 속도 ×10 느림, v0.7 디버깅 재발 위험
- B안 (커스텀 MCP): v0.7 사례 그대로 재현 위험
- E안 (Playwright+ChatGPT Plus): 비용 $0, 속도 5-8분, 사장님 ChatGPT 계정 차단 위험

**권고 3 케이스 (사장님 결정 보류)**:
1. ChatGPT 다목적 매일 사용 → A안 ($20/월 별도)
2. 거의 도구 전용 → E안 풀자동 PoC (1주 테스트)
3. 추가 결제 X + 보면서 통제 OK → **E안 반자동 ⭐** (도구가 자동입력+다운로드, 사장님이 Send만 11번 클릭)

**받을 정보 3종**:
1. "조" GPT(Projects) URL
2. 사장님 ChatGPT 사용 빈도 (다목적 vs 도구 전용)
3. 사장님 PC 크롬 ChatGPT 로그인 상태

사장님 결정 후 PoC 시작.

### [v0.7.13 미완] start_hidden.vbs wmic 의존 제거
사장님 노트북 부팅 시 7777 자동시작 실패 root cause = vbs:45 wmic 호출 stuck (Win11 deprecate). PowerShell `Get-CimInstance` 또는 단순 포트 검증으로 교체. v0.8과는 독립 — Higgsfield 제거와 무관하게 진행 가능.

## Done

### v0.8.0 — Higgsfield 통합 전면 제거 + ChatGPT 자리표시 (2026-06-10)
상세: `memory/project_v0.8_chatgpt_workflow.md`
