// v0.7 — Higgsfield MCP 기반 워크플로우 신규 엔드포인트 모음
//
// 신규 엔드포인트
//   POST /api/v07/section-prompts   : plan → slots[] (한국어 설명 + 영문 프롬프트 + 모델·비율)
//   POST /api/v07/generate-png      : 승인된 slots[]을 Higgsfield MCP로 일괄 생성 (Claude 위임)
//   POST /api/v07/inpaint/open      : 슬롯 PNG → data URL + Higgsfield Inpaint URL
//   POST /api/v07/inpaint/apply     : 수정 PNG 받아 슬롯 교체 + 자동 백업
//   POST /api/v07/inpaint/rollback  : 지정 버전 복원
//   GET  /api/v07/slot              : ?slug=&slot= → 현재 이미지 + 버전 목록
//
// 의존성
//   - lib/section-prompts.extractSlots
//   - lib/inpaint-store
//   - server.js의 callClaude / createJob / runJob / sendJSON / sendError / readBody / loadConfig
//
// 호출 패턴
//   const v07 = createV07Handlers({...server context...});
//   server에서 라우팅 시 v07.handleSectionPrompts(req, res) 등으로 사용

'use strict';

const fs = require('fs');
const path = require('path');
const { extractSlots } = require('./section-prompts');
const inpaintStore = require('./inpaint-store');
const higgsfieldCli = require('./higgsfield-cli');

const HIGGSFIELD_INPAINT_URL = 'https://higgsfield.ai/image/inpaint';

function createV07Handlers(ctx) {
  const {
    callClaude,
    createJob,
    runJob,
    sendJSON,
    sendError,
    readBody,
    loadConfig,
    OUTPUT_DIR,
    PayloadTooLargeError,
  } = ctx;

  if (!callClaude || !createJob || !runJob || !sendJSON || !sendError || !readBody || !loadConfig || !OUTPUT_DIR || !PayloadTooLargeError) {
    throw new Error('createV07Handlers: server context 누락');
  }

  // ---------------- helpers ----------------

  function clampMaxBody() {
    // 슬롯 메타·승인 정보·base64 inpaint 결과까지 고려
    // base64는 원본 대비 약 33% 크기 증가 → ceil(N*4/3) 사용
    const c = loadConfig();
    const maxImageBytes = (c.max_image_size_mb || 20) * 1024 * 1024;
    return Math.ceil(maxImageBytes * 4 / 3) + (2 * 1024 * 1024); // JSON 여유
  }

  async function parseJsonBody(req, max) {
    const raw = await readBody(req, max);
    try {
      return JSON.parse(raw.toString('utf-8'));
    } catch (e) {
      const err = new Error(`JSON 파싱 실패: ${e.message}`);
      err.status = 400;
      throw err;
    }
  }

  function buildMcpGeneratePrompt({ slots, outputSlugDir, slug, hints }) {
    // Claude CLI 세션에 Higgsfield MCP 도구가 활성화되어 있어야 동작.
    // 세션에 MCP 미연결 시 Claude는 실패 보고 — 클라이언트가 명시 에러로 인식하도록 응답 형식 강제.
    // ※ v0.7.1 — 사장님 지시: "전체 페이지 디자인" 만들지 말고 "제품·라이프스타일·USP 클로즈업·시연 컷"만 생성.
    // ※ v0.7.10 — 사장님 첨부 사진(attachImagePath)을 Higgsfield 호출 시 base 이미지로 전달.
    //    plan에서 product_based/reference_based 슬롯에 사장님 사진 경로가 매핑돼 있는데
    //    이전엔 그 정보가 prompt에 없어 Higgsfield가 새 이미지만 생성 → 사장님 제품과 무관한 결과.
    const lines = [];
    lines.push('# Higgsfield 이미지 생성 작업 (v0.7.10 — 제품 컷만 · 사장님 사진 활용)');
    lines.push('');
    lines.push('당신의 작업은 사장님이 ✓ 승인한 슬롯들에 대해 **제품 사진 · 라이프스타일 · USP 클로즈업 · 사용 시연 컷**만 생성하는 것입니다.');
    lines.push('상세페이지 자체는 별도 HTML 단계에서 조립되므로, **카피·레이아웃·텍스트 박힌 풀 페이지 디자인은 절대 만들지 마세요**.');
    lines.push('');
    lines.push('## 절대 규칙 (위반 시 결과 폐기)');
    lines.push('1. Higgsfield MCP 도구(`mcp__claude_ai_higgsfield_ai__generate_image` 또는 `mcp__higgsfield*` 계열)가 사용 가능한지 먼저 확인. 없으면 즉시 실패 보고하고 종료.');
    lines.push('2. **이미지 안에 한국어/영어 카피·헤드라인·라벨을 텍스트로 박지 말 것.** 자연스러운 제품 라벨(예: 제품 본체에 인쇄된 로고)은 OK, 별도 마케팅 텍스트는 X.');
    lines.push('3. 결과는 **사진·일러스트 한 컷** — 신문 광고·전단지·인포그래픽·UI mockup 형태 X.');
    lines.push('4. 각 슬롯의 `enPrompt`를 기본으로 사용. 위 규칙을 위해 필요 시 "no text, no captions, no UI elements" 같은 부정 프롬프트를 자동 추가해도 OK.');
    lines.push('5. 슬롯의 `model` 필드 준수 (gpt-image-2 / soul-2 / nano-banana-pro / seedream-4 / flux-2-pro).');
    lines.push('6. 비율 `ratio` 준수 (3:4 / 1:1 / 16:9 등).');
    lines.push('7. 생성 결과를 `save_as` 경로에 PNG로 저장 (다운로드 → fs.writeFile).');
    lines.push('8. 모든 슬롯 처리 후 마지막 줄에 정확히 `=== DONE ===` 만 출력.');
    lines.push('');
    lines.push('## ⚠ 사장님 첨부 사진 사용 규칙 (핵심)');
    lines.push('각 슬롯에 `attach_image_path` 필드가 있으면 — **사장님이 그 사진을 base로 활용해서 만들어달라고 요청한 것**입니다.');
    lines.push('- `prompt_mode: "product_based"` → 그 제품 사진을 **그대로** subject로 유지하고 배경/씬만 enPrompt에 따라 변경. 제품의 모양·색상·로고를 절대 재해석하지 마세요.');
    lines.push('- `prompt_mode: "reference_based"` → 그 기타 이미지를 visual base로 사용하고 enPrompt에 따라 보완/변형.');
    lines.push('- `prompt_mode: "new_image"` 또는 attach_image_path가 빈 경우 → 처음부터 새로 생성.');
    lines.push('Higgsfield MCP `generate_image` 호출 시, attach_image_path가 있는 슬롯은 그 파일을 **reference/input 이미지로 첨부**하세요 (도구 시그니처에 image input 파라미터가 있을 것입니다). 첨부 불가 시 즉시 실패 보고.');
    lines.push('');
    lines.push(`## 슬러그: ${slug}`);
    lines.push(`## 출력 폴더: ${outputSlugDir}`);
    if (hints && hints.length) {
      lines.push('## 전체 톤 힌트');
      for (const h of hints) lines.push(`- ${h}`);
    }
    lines.push('');
    lines.push('## 슬롯 목록 (JSON)');
    lines.push('```json');
    lines.push(JSON.stringify(slots.map(s => ({
      id: s.id,
      sectionName: s.sectionName,
      enPrompt: s.enPrompt,
      model: s.model,
      ratio: s.ratio,
      prompt_mode: s.promptMode || (s.attachImagePath ? 'product_based' : 'new_image'),
      attach_image_path: s.attachImagePath || '',
      save_as: path.join(outputSlugDir, `${s.id}.png`),
    })), null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## 보고 형식 (슬롯마다 한 줄)');
    lines.push('성공: `{"slot":"<id>","ok":true,"path":"<save_as>","model":"<model>","used_attached":<bool>,"credits":<n>}`');
    lines.push('실패: `{"slot":"<id>","ok":false,"error":"<message>"}`');
    lines.push('');
    lines.push('각 슬롯 처리 직후 즉시 위 JSON 한 줄을 stdout으로 출력. 마지막에 `=== DONE ===`.');
    lines.push('MANDATORY: 슬롯마다 처리 직후 반드시 위 JSON 한 줄만 출력. 자연어 요약/설명/마크다운/bullets 절대 금지. JSON 외 텍스트 출력 시 결과 무효 처리.');
    return lines.join('\n');
  }

  function parseMcpResult(output, slots) {
    const map = new Map();
    const txt = output || '';
    // 1) line-by-line JSON 우선 (가장 정확)
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith('{') || !t.endsWith('}')) continue;
      try {
        const obj = JSON.parse(t);
        if (obj && typeof obj.slot === 'string') map.set(obj.slot, obj);
      } catch (_) {}
    }
    // 2) fenced block fallback — ```json ... ``` 안 JSON 배열 또는 객체 줄
    const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
    let fm;
    while ((fm = fenceRe.exec(txt)) !== null) {
      const inner = (fm[1] || '').trim();
      if (!inner) continue;
      // 배열 시도
      try {
        const arr = JSON.parse(inner);
        if (Array.isArray(arr)) {
          for (const o of arr) if (o && typeof o.slot === 'string' && !map.has(o.slot)) map.set(o.slot, o);
          continue;
        }
        if (arr && typeof arr.slot === 'string' && !map.has(arr.slot)) { map.set(arr.slot, arr); continue; }
      } catch (_) {}
      // 줄 단위 JSON
      for (const line of inner.split(/\r?\n/)) {
        const t = line.trim().replace(/,$/, '');
        if (!t.startsWith('{') || !t.endsWith('}')) continue;
        try {
          const obj = JSON.parse(t);
          if (obj && typeof obj.slot === 'string' && !map.has(obj.slot)) map.set(obj.slot, obj);
        } catch (_) {}
      }
    }
    const results = [];
    for (const s of slots) {
      const r = map.get(s.id);
      if (r) results.push({ ...r, model_requested: s.model });
      else results.push({ slot: s.id, ok: null, error: 'Claude 응답에서 슬롯 결과를 찾지 못함', model_requested: s.model });
    }
    const done = /===\s*DONE\s*===/.test(txt);
    return { results, done };
  }

  function sanitizeSlug(slug) {
    if (typeof slug !== 'string' || !slug.length) throw new Error('slug 누락');
    if (slug.length > 80) throw new Error('slug 너무 김');
    if (!/^[a-zA-Z0-9._\-가-힣]+$/.test(slug)) throw new Error('slug 형식 불일치');
    return slug;
  }

  const ALLOWED_INPAINT_MIME = new Set(['png', 'jpeg', 'jpg', 'webp']);

  function parseDataUrl(dataUrl, maxBytes) {
    if (typeof dataUrl !== 'string' || dataUrl.length > 60 * 1024 * 1024) {
      // 60MB base64 = 약 45MB 바이너리. DoS 차단.
      const err = new Error('이미지 data URL 너무 큼');
      err.status = 413;
      throw err;
    }
    const m = /^data:image\/([a-zA-Z0-9+.\-]+);base64,(.+)$/.exec(dataUrl);
    if (!m) {
      const err = new Error('잘못된 이미지 data URL');
      err.status = 400;
      throw err;
    }
    const mime = m[1].toLowerCase();
    if (!ALLOWED_INPAINT_MIME.has(mime)) {
      const err = new Error(`허용되지 않는 MIME: image/${mime} (png/jpeg/webp만 허용)`);
      err.status = 400;
      throw err;
    }
    // base64 길이로 사전 사이즈 검사 (decode 전)
    const approxBytes = Math.floor(m[2].length * 3 / 4);
    if (maxBytes && approxBytes > maxBytes) {
      const err = new Error(`이미지가 너무 큽니다 (≈${approxBytes} > ${maxBytes})`);
      err.status = 413;
      throw err;
    }
    const buffer = Buffer.from(m[2], 'base64');
    // magic byte 검증
    const isPng  = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isJpeg = buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isWebp = buffer.length > 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';
    if (!isPng && !isJpeg && !isWebp) {
      const err = new Error('이미지 magic byte 검증 실패 (PNG/JPEG/WebP 아님)');
      err.status = 400;
      throw err;
    }
    return { mime, buffer };
  }

  function verifyImageFile(filePath) {
    // 저장된 파일이 실제 이미지인지 magic byte로 검증 (Claude가 텍스트 파일을 .png로 저장하는 사고 방지)
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(16);
      const n = fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      if (n < 4) return false;
      const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
      const isWebp = n >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
      return isPng || isJpeg || isWebp;
    } catch (_) {
      return false;
    }
  }

  // ---------------- handlers ----------------

  // POST /api/v07/section-prompts
  async function handleSectionPrompts(req, res) {
    try {
      const body = await parseJsonBody(req, 5 * 1024 * 1024);
      if (!body || !body.plan) return sendError(res, 400, 'plan 누락');
      const slots = extractSlots(body.plan, {
        defaultModel: body.defaultModel,
        defaultRatio: body.defaultRatio,
      });
      sendJSON(res, 200, { ok: true, slots, count: slots.length });
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return sendError(res, 413, e.message);
      sendError(res, e.status || 500, e.message);
    }
  }

  // POST /api/v07/generate-png
  // 입력: { slug, slots: [{id, enPrompt, model, ratio, ...} ...], style_key?, hints? }
  async function handleGeneratePng(req, res) {
    try {
      const body = await parseJsonBody(req, clampMaxBody());
      const { slug, slots, style_key, hints } = body || {};
      if (!slug) return sendError(res, 400, 'slug 누락');
      if (!Array.isArray(slots) || !slots.length) return sendError(res, 400, 'slots 누락');
      sanitizeSlug(slug);

      // 슬롯 검증 — 승인된 것만 받았다 가정. enPrompt와 id가 있어야 함.
      // id는 경로 트래버설 방지를 위해 safe name 강제
      const cleanSlots = [];
      for (const s of slots) {
        if (!s || !s.id || !s.enPrompt) continue;
        const sid = String(s.id);
        try {
          inpaintStore.assertSafeName(sid, 'slot.id');
        } catch (e) {
          return sendError(res, 400, `슬롯 id 형식 오류: ${e.message}`);
        }
        // v0.7.10 — 사장님 첨부 사진 경로(attachImagePath) 보존 + path traversal 방어 후 보존
        let safeAttach = null;
        if (s.attachImagePath && typeof s.attachImagePath === 'string') {
          const p = path.normalize(s.attachImagePath);
          // 도메인 안 uploads/ 폴더 안인지 검증 (외부 경로 차단)
          // 정확한 cwd 기반 검증은 cleanSlots 만들기 전 단계라 어려우므로
          // 일단 ".." 같은 트래버설 패턴만 차단하고 실 사용 시 fs.existsSync로 검증
          if (!p.includes('..') && p.length < 500) {
            safeAttach = p;
          }
        }
        cleanSlots.push({
          id: sid,
          sectionName: String(s.sectionName || '').slice(0, 80),
          enPrompt: String(s.enPrompt).slice(0, 4000),
          model: String(s.model || 'gpt-image-2').slice(0, 40),
          ratio: String(s.ratio || '3:4').slice(0, 16),
          promptMode: String(s.promptMode || '').slice(0, 32) || null,
          attachImagePath: safeAttach,
        });
      }
      if (!cleanSlots.length) return sendError(res, 400, '유효한 슬롯이 없습니다');

      const config = loadConfig();
      const cwd = config.styles?.[style_key || config.default_style]?.domain_path;
      if (!cwd || !fs.existsSync(cwd)) return sendError(res, 500, `도메인 폴더 없음: ${style_key || config.default_style}`);

      const outputSlugDir = path.join(OUTPUT_DIR, slug);
      if (!fs.existsSync(outputSlugDir)) fs.mkdirSync(outputSlugDir, { recursive: true });

      // v0.7.2 — config.higgsfield_mode로 호출 경로 선택
      //   "claude" (사장님 PC 기본): Claude CLI에 Higgsfield 플러그인/MCP 위임
      //   "cli"                   : 글로벌 higgsfield CLI 직접 spawn
      //   "auto"                  : CLI 먼저, 실패 시 Claude 폴백
      const mode = (config.higgsfield_mode || 'claude').toString().toLowerCase();

      const job = createJob('v07-generate', { slug, slotCount: cleanSlots.length, style_key: style_key || null, mode });

      runJob(job, async (j) => {
        const t0 = Date.now();

        // 슬롯에 부정 키워드 자동 부착 (사장님 지시: 텍스트·UI 박힌 풀 페이지 금지)
        const negativeSuffix = ' --- IMPORTANT: pure product/lifestyle photography or illustration only. NO text, NO captions, NO UI elements, NO marketing copy overlay.';
        const enrichedSlots = cleanSlots.map(s => ({
          ...s,    // promptMode, attachImagePath 자동 보존
          enPrompt: s.enPrompt + negativeSuffix,
        }));

        // ───────── 호출 경로 1: CLI 직접 spawn ─────────
        async function runViaCli() {
          const slotsForCli = enrichedSlots.map(s => ({
            id: s.id,
            enPrompt: s.enPrompt,
            model: s.model,
            ratio: s.ratio,
            savePath: path.join(outputSlugDir, `${s.id}.png`),
          }));
          const cliResults = await higgsfieldCli.generateMany(slotsForCli, { concurrency: 2, jobRef: j });
          return cliResults;
        }

        // ───────── 가용성 사전 점검 (claude 모드 전용) ─────────
        // 11슬롯 비싸게 돌리기 전에 짧은 dry-run으로 Higgsfield MCP/플러그인이 세션에 노출돼 있는지 확인.
        // claude가 "Higgsfield MCP 도구(mcp__higgsfield* 계열)가 사용 가능한지" 질문에 yes/no로 응답하는 패턴.
        async function probeHiggsfieldAvailable() {
          const probePrompt = [
            '# Higgsfield MCP 가용성 점검',
            '',
            '당신은 다음 한 가지만 수행합니다. 이미지 생성은 하지 마세요.',
            '',
            '1. 현재 세션에 Higgsfield MCP 도구(`mcp__higgsfield*` 또는 `mcp__claude_ai_higgsfield_ai__*` 계열)가 노출돼 있는지 확인',
            '2. 결과를 정확히 한 줄 JSON으로만 출력:',
            '   - 노출됨: `{"higgsfield_available":true,"detected":"<발견한 도구명 prefix>"}`',
            '   - 노출 안 됨: `{"higgsfield_available":false,"reason":"<짧은 사유>"}`',
            '',
            '그 외 어떤 텍스트도 출력하지 마세요. 마지막에 `=== DONE ===` 만 추가.',
          ].join('\n');
          try {
            const probeOut = await callClaude(cwd, probePrompt, j, { allowTools: true });
            // 본문에서 마지막 JSON 한 줄 추출
            const lines = (probeOut || '').split(/\r?\n/);
            for (let i = lines.length - 1; i >= 0; i--) {
              const t = lines[i].trim();
              if (t.startsWith('{') && t.endsWith('}')) {
                try {
                  const obj = JSON.parse(t);
                  if (typeof obj.higgsfield_available === 'boolean') return obj;
                } catch (_) {}
              }
            }
            return { higgsfield_available: false, reason: 'probe 응답 파싱 실패', raw_excerpt: (probeOut || '').slice(0, 300) };
          } catch (e) {
            return { higgsfield_available: false, reason: `probe 호출 실패: ${e.message}` };
          }
        }

        // ───────── 호출 경로 2: Claude CLI 위임 (플러그인/MCP) ─────────
        async function runViaClaude() {
          // 가용성 사전 점검 — config.higgsfield_dry_check=true 일 때만
          if (config.higgsfield_dry_check !== false) {
            const probe = await probeHiggsfieldAvailable();
            if (!probe.higgsfield_available) {
              const reason = probe.reason || '알 수 없음';
              const detail = probe.raw_excerpt ? ` · 응답 일부: ${probe.raw_excerpt}` : '';
              const err = new Error(`Claude CLI 세션에 Higgsfield MCP/플러그인이 연결돼 있지 않습니다. 사유: ${reason}${detail}. 해결: claude.ai에서 Higgsfield 플러그인을 추가하거나 \`claude mcp add\` 명령으로 mcp.higgsfield.ai 연결 후 서버 재시작.`);
              err.code = 'HIGGSFIELD_UNAVAILABLE';
              throw err;
            }
            console.log(`[v07-generate ${j.id}] Higgsfield 가용성 OK — detected=${probe.detected || '?'}`);
          }
          const prompt = buildMcpGeneratePrompt({
            slots: enrichedSlots,
            outputSlugDir,
            slug,
            hints: Array.isArray(hints) ? hints : [],
          });
          // callClaude는 cwd / prompt / jobRef / options 를 받음. allowTools:true 가 핵심 — MCP/플러그인 호출 허용.
          const output = await callClaude(cwd, prompt, j, { allowTools: true });
          const parsed = parseMcpResult(output || '', enrichedSlots);
          // parseMcpResult는 { results: [{slot, ok, error, model_requested}...], done } 반환
          return parsed.results.map(r => ({
            slot: r.slot,
            ok: !!r.ok,
            error: r.error || null,
            model_requested: r.model_requested,
            raw: null,
          }));
        }

        // 호출 시도 + 실패 폴백
        let rawResults = null;
        let primaryError = null;
        try {
          if (mode === 'cli' || mode === 'auto') {
            try { rawResults = await runViaCli(); }
            catch (e) {
              primaryError = e;
              if (mode === 'cli') throw e;
              // auto: Claude로 폴백
              console.warn(`[v07-generate ${j.id}] CLI 실패 → Claude 위임 폴백: ${e.message}`);
              rawResults = await runViaClaude();
            }
          } else {
            // mode === 'claude' (기본)
            rawResults = await runViaClaude();
          }
        } catch (e) {
          return {
            ok: false,
            slug,
            elapsed_ms: Date.now() - t0,
            done: false,
            slot_count: cleanSlots.length,
            succeeded: 0,
            failed: cleanSlots.length,
            mode,
            results: enrichedSlots.map(s => ({
              slot: s.id,
              ok: false,
              error: `Higgsfield 호출 실패 (mode=${mode}): ${e.message}`,
              model_requested: s.model,
            })),
            preview_urls: [],
            error: e.message,
            primary_error: primaryError ? primaryError.message : null,
          };
        }
        const elapsed = Date.now() - t0;

        // 결과 → magic byte 재검증 (Claude가 텍스트를 .png로 저장하는 사고 차단)
        const verified = rawResults.map(r => {
          const p = path.join(outputSlugDir, `${r.slot}.png`);
          const exists = fs.existsSync(p);
          const size = exists ? fs.statSync(p).size : 0;
          const isImage = exists && size > 0 ? verifyImageFile(p) : false;
          const okFinal = exists && size > 0 && isImage;
          let err = r.error || null;
          if (!exists) err = err || '파일 저장 검증 실패 — 디스크에 없음';
          else if (size === 0) err = err || '파일이 0바이트 — 저장 실패';
          else if (!isImage) err = err || '저장된 파일이 PNG/JPEG/WebP가 아님';
          return {
            slot: r.slot,
            ok: okFinal,
            error: okFinal ? null : err,
            model_requested: r.model_requested,
            verified_exists: exists,
            verified_size: size,
            verified_is_image: isImage,
            raw: r.raw || null,
          };
        });

        return {
          ok: true,
          slug,
          mode,
          elapsed_ms: elapsed,
          done: true,
          slot_count: cleanSlots.length,
          succeeded: verified.filter(r => r.ok).length,
          failed: verified.filter(r => !r.ok).length,
          results: verified,
          preview_urls: verified.filter(r => r.ok).map(r => ({
            slot: r.slot,
            url: `/output/${encodeURIComponent(slug)}/${encodeURIComponent(r.slot)}.png`,
          })),
        };
      });

      sendJSON(res, 202, { ok: true, job_id: job.id, type: 'v07-generate' });
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return sendError(res, 413, e.message);
      sendError(res, e.status || 500, e.message);
    }
  }

  // POST /api/v07/inpaint/open
  async function handleInpaintOpen(req, res) {
    try {
      const body = await parseJsonBody(req, 1 * 1024 * 1024);
      const { slug, slotId } = body || {};
      if (!slug || !slotId) return sendError(res, 400, 'slug 또는 slotId 누락');
      sanitizeSlug(slug);
      const dataUrl = inpaintStore.readSlotBase64(OUTPUT_DIR, slug, slotId);
      sendJSON(res, 200, {
        ok: true,
        clipboardData: dataUrl,
        higgsfieldUrl: HIGGSFIELD_INPAINT_URL,
      });
    } catch (e) {
      if (e.code === 'SLOT_NOT_FOUND') return sendError(res, 404, e.message);
      if (e instanceof PayloadTooLargeError) return sendError(res, 413, e.message);
      sendError(res, e.status || 500, e.message);
    }
  }

  // POST /api/v07/inpaint/apply
  async function handleInpaintApply(req, res) {
    try {
      const body = await parseJsonBody(req, clampMaxBody());
      const { slug, slotId, newImageBase64 } = body || {};
      if (!slug || !slotId || !newImageBase64) return sendError(res, 400, '필수 필드 누락 (slug/slotId/newImageBase64)');
      sanitizeSlug(slug);

      const maxBytes = (loadConfig().max_image_size_mb || 20) * 1024 * 1024;
      const { buffer } = parseDataUrl(newImageBase64, maxBytes);
      if (buffer.length > maxBytes) return sendError(res, 413, '이미지가 너무 큽니다');

      const result = inpaintStore.saveSlot(OUTPUT_DIR, slug, slotId, buffer);
      const versions = inpaintStore.listVersions(OUTPUT_DIR, slug, slotId);

      sendJSON(res, 200, {
        ok: true,
        path: result.path,
        backed_up: result.backedUp,
        backup_version: result.backupVersion,
        total_versions: versions.length,
      });
    } catch (e) {
      if (e instanceof PayloadTooLargeError) return sendError(res, 413, e.message);
      sendError(res, e.status || 500, e.message);
    }
  }

  // POST /api/v07/inpaint/rollback
  async function handleInpaintRollback(req, res) {
    try {
      const body = await parseJsonBody(req, 1 * 1024 * 1024);
      const { slug, slotId, version } = body || {};
      if (!slug || !slotId || version == null) return sendError(res, 400, '필수 필드 누락');
      sanitizeSlug(slug);
      const r = inpaintStore.rollback(OUTPUT_DIR, slug, slotId, version);
      sendJSON(res, 200, r);
    } catch (e) {
      if (e.code === 'VERSION_NOT_FOUND') return sendError(res, 404, e.message);
      sendError(res, e.status || 500, e.message);
    }
  }

  // GET /api/v07/slot?slug=&slot=
  async function handleSlotInfo(req, res, url) {
    try {
      const slug = url.searchParams.get('slug');
      const slotId = url.searchParams.get('slot');
      if (!slug || !slotId) return sendError(res, 400, 'slug 또는 slot 쿼리 누락');
      sanitizeSlug(slug);
      const dataUrl = inpaintStore.readSlotBase64(OUTPUT_DIR, slug, slotId);
      const versions = inpaintStore.listVersions(OUTPUT_DIR, slug, slotId).map(v => ({
        version: v.version,
        file: v.file,
      }));
      sendJSON(res, 200, { ok: true, slug, slot: slotId, image: dataUrl, versions });
    } catch (e) {
      if (e.code === 'SLOT_NOT_FOUND') return sendError(res, 404, e.message);
      sendError(res, e.status || 500, e.message);
    }
  }

  return {
    handleSectionPrompts,
    handleGeneratePng,
    handleInpaintOpen,
    handleInpaintApply,
    handleInpaintRollback,
    handleSlotInfo,
  };
}

module.exports = { createV07Handlers };
