// v0.7 — plan JSON → 슬롯 메타데이터 추출
// 입력 : handlePlan 결과의 plan 객체 (sections[] 보유)
// 출력 : slots[] — { id, sectionName, koDesc, enPrompt, model, ratio, productImageRef, approved }
//
// 이 모듈은 plan에 이미 들어있는 image_slug / image_prompt_en 등 메타를
// "Higgsfield MCP 호출에 적합한 형태"로 정규화한다.
// LLM(Claude)에게 추가 호출은 하지 않는다 — 변환만.

'use strict';

const MODEL_DEFAULT = 'gpt-image-2';   // 사장님 합의: 1차 기본은 GPT Image 2
const RATIO_DEFAULT = '3:4';           // 세로 비율 (상세페이지 표준)

function stripBr(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

function clip(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function shortKoDescription(sec) {
  // 사장님이 ✓/✗ 토글 보고 즉시 판단할 수 있는 길이 — 약 60자 이내
  const head = clip(stripBr(sec.head || sec.title || sec.name || ''), 40);
  const sub  = clip(stripBr(sec.sub  || sec.subtitle || ''), 36);
  return [head, sub].filter(Boolean).join(' · ');
}

function buildEnPromptFallback(sec) {
  // plan에 image_prompt_en이 없을 경우 최소한의 영문 프롬프트 자동 합성
  const head = stripBr(sec.head || sec.title || '');
  const sub  = stripBr(sec.sub  || '');
  const layout = stripBr(sec.layout || '');
  return [
    'Vertical e-commerce detail page section, 1024x1536.',
    head ? `Headline copy in Korean Hangul (Pretendard Black 110px): "${head}".` : '',
    sub  ? `Sub copy below (Pretendard Regular 36px): "${sub}".` : '',
    layout || 'Clean layout with strong typography.',
  ].filter(Boolean).join(' ');
}

function pickModel(sec, defaultModel = MODEL_DEFAULT) {
  // 슬롯 메타에 model 지정이 있으면 사용, 없으면 default
  // 'gpt-image-2' | 'soul-2' | 'nano-banana-pro' | 'seedream-4' 등
  const m = (sec.model || sec.image_model || '').toString().trim().toLowerCase();
  if (!m) return defaultModel;
  // 별칭 정규화
  if (m.startsWith('gpt')) return 'gpt-image-2';
  if (m.startsWith('soul')) return 'soul-2';
  if (m.startsWith('nano')) return 'nano-banana-pro';
  if (m.startsWith('seedream')) return 'seedream-4';
  if (m.startsWith('flux')) return 'flux-2-pro';
  return defaultModel;
}

function pickRatio(sec, defaultRatio = RATIO_DEFAULT) {
  // 세로/가로/정사각 가이드
  const r = (sec.ratio || sec.aspect || '').toString().trim();
  if (!r) return defaultRatio;
  if (/^\d+:\d+$/.test(r)) return r;
  return defaultRatio;
}

// 슬롯 ID 정규화 — 경로 트래버설 / 위험 문자 제거
// SAFE_NAME_RE와 동일 정책 ([a-zA-Z0-9._\-가-힣]) + 최대 80자
function normalizeSlotId(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/[\\/]/g, '_')       // 경로 구분자 제거
    .replace(/\.\./g, '_')         // 트래버설 제거
    .replace(/[^a-zA-Z0-9._\-가-힣]/g, '_')  // 허용 문자만
    .replace(/^_+|_+$/g, '')       // 앞뒤 underscore 정리
    .slice(0, 80);
  return cleaned || fallback;
}

function extractSlots(plan, opts = {}) {
  if (!plan || !Array.isArray(plan.sections)) return [];
  const defaultModel = opts.defaultModel || MODEL_DEFAULT;
  const defaultRatio = opts.defaultRatio || RATIO_DEFAULT;

  const slots = [];
  let idx = 0;
  for (const sec of plan.sections) {
    idx += 1;
    // 이미지 슬롯이 정의된 섹션만 (image_slug 없거나 image=none 이면 skip)
    const rawSlug = sec.image_slug || sec.slug || null;
    const noImage = sec.image === false || sec.image === 'none' || sec.no_image === true;
    if (noImage && !rawSlug) continue;
    if (!rawSlug && !sec.image_prompt_en && !sec.image_prompt && !sec.head) continue;

    const fallbackId = `slot_${String(idx).padStart(2, '0')}`;
    const id = rawSlug ? normalizeSlotId(rawSlug, fallbackId) : fallbackId;
    slots.push({
      id,
      sectionIndex: idx,
      sectionName: sec.name || sec.title || sec.head || `섹션 ${idx}`,
      koDesc: shortKoDescription(sec) || `섹션 ${idx} 이미지`,
      enPrompt: stripBr(sec.image_prompt_en || sec.image_prompt || buildEnPromptFallback(sec)),
      model: pickModel(sec, defaultModel),
      ratio: pickRatio(sec, defaultRatio),
      productImageRef: sec.product_image || sec.image_ref || null,
      approved: null,   // null = 미선택 · true = 승인 · false = 거절
    });
  }
  return slots;
}

module.exports = {
  extractSlots,
  shortKoDescription,
  buildEnPromptFallback,
  normalizeSlotId,
  MODEL_DEFAULT,
  RATIO_DEFAULT,
};
