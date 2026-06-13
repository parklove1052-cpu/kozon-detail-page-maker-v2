---
name: 제품 히어로 사진을 ChatGPT 자동 흐름에 항상 레퍼런스로 첨부
description: ChatGPT 자동 이미지 생성 시 사장님 제공 제품 히어로 사진을 모든 product_based/reference_based 슬롯의 input[type=file]로 자동 첨부할 것. 영구 규칙.
type: feedback
---

# 제품 히어로 사진을 ChatGPT 자동 흐름에 항상 레퍼런스로 첨부

ChatGPT 자동 이미지 생성(`generateImagesInProjectParallel`) 흐름에서, **사장님이 Step 1에서 올린 제품 히어로 사진을 모든 `product_based` / `reference_based` 슬롯의 ChatGPT 입력박스에 input[type=file]로 자동 첨부**할 것. 영구 규칙.

**Why:**
- 2026-06-13 478초 풀 플로우 테스트에서 9/9 슬롯이 모두 정확한 사과 결과로 나온 **결정적 요인 = 매 탭에 사장님 사과 사진을 첨부했기 때문**.
- 첨부 안 하면 ChatGPT가 텍스트 프롬프트만으로 추측 → 색감·구도·질감이 사장님 실제 제품과 멀어짐 (v0.9 미해결로 적혀 있던 conversation 학습 오염 이슈의 진짜 해결책).
- v0.9 메모리 「사장님 지시 ②」 ("내가 제공한 hero 이미지를 GPT에 레퍼런스로 제출")의 영구화. 사장님 직접 지시 2026-06-14.

**How to apply:**
- 현재 구조 유지: `plan` API가 `image_requests`의 각 항목에 `prompt_mode`(`new_image` / `product_based` / `reference_based`) + `attach_image_path`를 채워 보냄
- `autoGenerateViaChatGPT`(app.js)가 그대로 `prompts` 객체 배열로 서버에 전송 — 변경 X
- `submitPromptOnPage`(chatgpt-image.mjs)가 `attachPath` 받으면 `attachImageToInput`으로 input[type=file] setInputFiles + 미리보기 thumbnail 폴링 → 이 흐름 끊지 말 것
- 새 자동 흐름 추가 시(다른 카테고리/도매처/플랫폼 등) 반드시 같은 패턴 유지
- `prompt_mode === new_image`인 슬롯(완전 신규 컨셉 컷)은 첨부 X — 그 외 슬롯은 모두 첨부 기본값
- conversation 학습 오염 이슈는 이 첨부 패턴 덕에 사실상 무력화됨 (2026-06-13 9차 풀 플로우 실측 확인)
