# 상세페이지 제작자 todos

진행 중인 작업 추적.

## In Progress

## Pending

### [v0.9 후속 — 사장님 결정 대기] conversation 학습 오염 해소
**현 흐름**: 사장님 "프로젝트(조)" 안 기존 9개 대화 재활용 → 각자 다른 학습 컨텍스트(Causone 박스, 카메라 펜던트 등)가 사과 결과를 오염시킴.

**해결책 후보**:
- A (정석): 사장님이 "프로젝트(조)" 안에 **빈 대화 9개+ 새로 만들어 두기** (예: "자동생성 슬롯 1~9"). 각 빈 대화에 "여기서는 이미지 생성만 합니다, 매 메시지마다 첨부+프롬프트 그대로 처리" 같은 시스템 지시 한 줄
- B (휴리스틱): 가장 사용 안 한 대화 우선 선택 — 완벽 X

사장님 결정 후 진행.

### [v0.9 후속 — 코드 작업 후보] 잡 진행 진척 표시 강화
직렬화 큐 대기 중일 때 사장님에게 "대기 중 N번째" 안내. 현재는 대기 상태 표시 모호.

### [v0.8 후속] style.css dead CSS 정리
v0.7 Higgsfield/Inpaint 관련 클래스 통째 제거 (`.approval-card`, `.approval-toolbar`, `.generation-status`, `.inpaint-modal*` 등 L1362-L1710 정도). 현재는 미사용이라 동작 무리 없음 — 한가할 때 청소.

### [v0.7.13 미완] start_hidden.vbs wmic 의존 제거
사장님 노트북 부팅 시 7777 자동시작 실패 root cause = vbs:45 wmic 호출 stuck (Win11 deprecate). PowerShell `Get-CimInstance` 또는 단순 포트 검증으로 교체. v0.8/v0.9와는 독립.

## Done

### v0.9 — ChatGPT(조) 자동 통합 완성 (2026-06-13)
「① 기획」 한 번 클릭으로 plan → ChatGPT(조) 진입 → 기존 대화 N개 재활용 → 사장님 사진 자동 첨부 → 결과 다운로드 → Step 3 슬롯 자동 채움. Phase E 자동 테스트 447초 풀 플로우 성공. 12건 패치 누적. 커밋 591818c.
상세: `memory/project_v0.9_chatgpt_project_integration.md`

### v0.8.0 — Higgsfield 통합 전면 제거 + ChatGPT 자리표시 (2026-06-10)
상세: `memory/project_v0.8_chatgpt_workflow.md`
