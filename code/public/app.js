// 코존 상세페이지 제작 도구 - 클라이언트 JS
// 의존성 없음, ES2020+

'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// 브릿지: file:// 로 열면 http://127.0.0.1:7777 로 fetch. 같은 origin (서버가 정적 서빙)이면 빈 문자열.
const API_BASE = (location.protocol === 'file:' || !location.host) ? 'http://127.0.0.1:7777' : '';

// ────────── 활성 Job 추적 (페이지 닫기 시 서버에 cancel 통보) ──────────
// Codex 진단 1-2 해결: 페이지 새로고침/닫기 시 navigator.sendBeacon으로 활성 job 취소
const activeJobs = new Set();
function registerActiveJob(jobId) { if (jobId) activeJobs.add(jobId); }
function unregisterActiveJob(jobId) { if (jobId) activeJobs.delete(jobId); }
function cancelActiveJobsBeacon() {
  for (const jobId of activeJobs) {
    try {
      // sendBeacon은 페이지 unload 중에도 보장되는 fire-and-forget POST
      navigator.sendBeacon(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/cancel`, '');
    } catch (_) {}
  }
  activeJobs.clear();
}
// 페이지 닫기·새로고침·이동 시 모두 발동
window.addEventListener('pagehide', cancelActiveJobsBeacon);
window.addEventListener('beforeunload', cancelActiveJobsBeacon);

// ────────── Background Job 폴링 ──────────
// 서버가 /api/plan, /api/generate를 비동기 job 패턴으로 변경 — 응답이 { job_id } 이면 폴링.
// LLM이 10분+ 걸려도 fetch 안 끊김. 30분 한도 (운영자 보호용).
async function pollJob(jobId, opts = {}) {
  const { interval = 2000, maxMs = 1800000, onProgress } = opts;
  const start = performance.now();
  let lastState = null;
  while (true) {
    if (performance.now() - start > maxMs) {
      throw new Error(`job 폴링 timeout (${Math.round(maxMs/1000)}초)`);
    }
    let r, data;
    try {
      r = await api(`/api/jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 15000 });
      data = await r.json();
    } catch (e) {
      // 일시적 네트워크 오류는 무시하고 한 번 더 시도
      console.warn(`[pollJob] 일시 오류 — ${e.message} (재시도)`);
      await new Promise((rs) => setTimeout(rs, interval));
      continue;
    }
    if (!r.ok || !data.ok || !data.job) {
      throw new Error(`/api/jobs/${jobId} ${r.status} ${(data && data.error) || ''}`);
    }
    const job = data.job;
    if (job.state !== lastState) {
      console.log(`[pollJob ${jobId}] ${job.state} ${job.elapsed_ms || 0}ms`);
      lastState = job.state;
    }
    if (onProgress) onProgress(job);
    if (job.state === 'done') return job.result;
    if (job.state === 'failed') throw new Error(job.error || 'job 실패');
    await new Promise((rs) => setTimeout(rs, interval));
  }
}

// fetch wrapper — opts.timeoutMs 가 있으면 AbortController 로 강제 종료.
// (Codex 진단 1·2·7번: fetch 영구 pending 시 catch/finally 도달 못 해 다운로드 버튼 잠긴 채 머무름)
function api(path, opts = {}) {
  const { timeoutMs, ...fetchOpts } = opts;
  if (!timeoutMs) return fetch(`${API_BASE}${path}`, fetchOpts);
  const ac = new AbortController();
  const tid = setTimeout(() => {
    try { ac.abort(); } catch (_) {}
  }, timeoutMs);
  const merged = { ...fetchOpts, signal: ac.signal };
  return fetch(`${API_BASE}${path}`, merged)
    .catch((err) => {
      if (err && err.name === 'AbortError') {
        throw new Error(`요청 타임아웃 (${Math.round(timeoutMs / 1000)}초) — 서버 응답이 없습니다.`);
      }
      throw err;
    })
    .finally(() => clearTimeout(tid));
}

const state = {
  // Step 1 이미지 — 제품 사진(배경/씬만 바꿀 기준)과 기타(상세페이지에 활용할 이미지) 분리
  productImages: [],       // 제품 사진 { name, dataUrl, size }
  referenceImages: [],     // 기타 이미지 (상세페이지에 그대로 활용)
  styles: [],
  defaultStyle: null,
  contentStyles: [],
  defaultContentStyle: null,
  references: [],          // 프리랜서 레퍼런스 목록
  plan: null,              // /api/plan 응답의 plan 객체
  slotImages: {},          // { slug: { name, dataUrl } } — 슬롯별 최종 이미지 (자동 생성 또는 수동 업로드)
  attachedPathMap: {},     // 서버에 저장된 절대 경로 → 원본 dataUrl 매핑 (썸네일 표시용)
  lastGeneratedHTML: null,
  viewMode: 'code', // 'code' | 'preview'
  inflight: {},     // 동일 액션 중복 클릭 방지 플래그 — { plan: bool, generate: bool, extract: bool, jpeg: bool, higgsfield: bool }
  // v0.7 — Higgsfield 자동 생성
  slug: null,                 // 현재 세션 slug (output 폴더명)
  approvalSlots: [],          // [{ id, sectionIndex, sectionName, koDesc, enPrompt, model, ratio, approved, status, error }]
  generateJobId: null,
  currentInpaintSlot: null,   // Inpaint 모달이 작업 중인 슬롯 id
};

// 경로 비교용 정규화 (백슬래시/슬래시 + 대소문자 차이 흡수)
const normalizePath = (p) => String(p || '').replace(/\\/g, '/').toLowerCase().trim();

// ────────── 토스트 ──────────
function toast(message, type = 'info', timeoutMs = 3000) {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast toast--${type === 'error' ? 'err' : type === 'success' ? 'ok' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), timeoutMs);
}

// ────────── 로딩 ──────────
function setLoading(on, message) {
  const overlay = $('#loading-overlay');
  const msg = $('#loading-message');
  if (message) msg.textContent = message;
  overlay.hidden = !on;
}

// Codex 진단 5-1: 하드코딩 비교 대신 — "페이지가 처음 로드된 시점의 서버 버전"을 기준점으로 잡고
// 이후 health 체크 시 버전이 바뀌면(= 서버 재부팅) 새로고침 안내. 보다 견고한 패턴.
let serverInfoCache = null;          // 마지막 health 응답
let serverInfoBaseline = null;       // 페이지 첫 로드 시점의 server 정보 (기준)

// 서버 OFF 배너 표시/숨기기
function showServerOfflineBanner(reason) {
  const banner = $('#server-offline-banner');
  const pathEl = $('#server-offline-path');
  if (banner) banner.hidden = false;
  // file:// 컨텍스트면 도메인 폴더 경로 추정 안내
  if (pathEl) {
    const isFile = location.protocol === 'file:';
    if (isFile) {
      // file:///C:/.../code/public/index.html → 도메인 폴더(.../상세페이지 제작자) 추정
      try {
        const url = decodeURIComponent(location.href);
        const m = url.match(/^file:\/\/\/(.*?)\/code\/public\/index\.html/i);
        if (m && m[1]) pathEl.textContent = `도메인 폴더: ${m[1].replace(/\//g, '\\')}`;
        else pathEl.textContent = '';
      } catch (_) { pathEl.textContent = ''; }
    } else {
      pathEl.textContent = reason ? `진단: ${reason}` : '';
    }
  }
}
function hideServerOfflineBanner() {
  const banner = $('#server-offline-banner');
  if (banner) banner.hidden = true;
}

// 서버 OFF 상태에서 select들을 빈 채로 두지 않도록 안내 placeholder 채움
function setSelectsToOfflineState() {
  const targets = ['#style-select', '#content-style-select', '#reference-select', '#ip-reference'];
  for (const sel of targets) {
    const el = document.querySelector(sel);
    if (!el) continue;
    // 이미 정상 옵션이 채워져 있으면 그대로 둔다 (성공 후 다시 OFF되는 회귀 케이스 보호)
    if (el.options.length > 0 && el.options[0].value !== '__offline__') continue;
    el.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '__offline__';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = '⚠ 서버 OFF — 서버 재시작.bat 실행 후 새로고침';
    el.appendChild(opt);
  }
}

// 서버 OFF/ON 상태 (실패 시 큰 안내 + select placeholder)
let __isServerOnline = null;     // null | true | false (변화 감지)
function markServerOnline() {
  if (__isServerOnline !== true) {
    // OFF → ON 전환: select 다시 로드 (placeholder 제거)
    if (__isServerOnline === false) {
      // 비동기 로드 — fire-and-forget
      Promise.all([loadStyles(), loadReferences()]).catch(() => {});
    }
    __isServerOnline = true;
  }
  hideServerOfflineBanner();
}
function markServerOffline(reason) {
  if (__isServerOnline !== false) {
    __isServerOnline = false;
  }
  showServerOfflineBanner(reason);
  setSelectsToOfflineState();
}

// ────────── 서버 헬스 체크 ──────────
async function pingServer() {
  try {
    const r = await api('/api/health', { timeoutMs: 4000 });
    const dot = $('#server-status');
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json().catch(() => ({}));
    serverInfoCache = data.server || null;
    // baseline: 페이지 첫 로드 시점 버전을 기준으로 저장
    if (!serverInfoBaseline && serverInfoCache) {
      serverInfoBaseline = { ...serverInfoCache };
    }
    // 버전 변경 감지 — 서버 재부팅(부팅 시각 변경) 시 사장님께 새로고침 안내
    const sv = serverInfoCache?.version;
    const bootChanged = serverInfoBaseline && serverInfoCache &&
      serverInfoBaseline.boot_time && serverInfoCache.boot_time &&
      serverInfoBaseline.boot_time !== serverInfoCache.boot_time;
    if (bootChanged && !window.__serverRebootedWarned) {
      window.__serverRebootedWarned = true;
      toast(`🔄 서버가 재부팅됐습니다. Ctrl+F5로 새로고침해 주세요. (새 버전: ${sv || '?'})`, 'info', 10000);
    }
    if (!sv) {
      dot.classList.remove('dot--ok', 'dot--idle');
      dot.classList.add('dot--err');
      dot.title = '⚠ 서버 버전 정보 없음 — 옛 코드일 수 있음';
    } else {
      dot.classList.remove('dot--err', 'dot--idle');
      dot.classList.add('dot--ok');
      const bootStr = serverInfoCache?.boot_time ? new Date(serverInfoCache.boot_time).toLocaleString('ko-KR') : '?';
      dot.title = `서버 ${sv} · 부팅 ${bootStr} · higgsfield_mode=${serverInfoCache?.higgsfield_mode || '?'}`;
    }
    // v07 핸들러 비활성 알림
    if (data.v07 && data.v07.ok === false && !window.__v07WarnedOnce) {
      window.__v07WarnedOnce = true;
      toast(`⚠ v0.7 Higgsfield 워크플로우 비활성 — ${data.v07.error || '서버 콘솔 확인'}`, 'error', 9000);
    }
    markServerOnline();
  } catch (err) {
    const dot = $('#server-status');
    if (dot) {
      dot.classList.remove('dot--ok', 'dot--idle');
      dot.classList.add('dot--err');
      dot.title = '서버 응답 없음 — 서버 재시작.bat 더블클릭';
    }
    markServerOffline(err && err.message ? err.message : '서버 응답 없음');
  }
}

// ────────── 스타일 로드 ──────────
async function loadStyles() {
  try {
    const r = await api('/api/styles', { timeoutMs: 5000 });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    state.styles = data.styles || [];
    state.defaultStyle = data.default_style;
    state.contentStyles = data.content_styles || [];
    state.defaultContentStyle = data.default_content_style;
    populateSelect('#style-select', state.styles, state.defaultStyle);
    populateSelect('#content-style-select', state.contentStyles, state.defaultContentStyle);
    updateStyleDesc();
    updateContentStyleDesc();
  } catch (err) {
    // 서버 OFF/응답 실패 — select 비워두지 말고 안내 placeholder 채움
    setSelectsToOfflineState();
    // 토스트는 pingServer가 안 떠 있을 때 시끄럽지 않게 — 첫 1회만
    if (!window.__styleLoadWarned) {
      window.__styleLoadWarned = true;
      toast(`스타일 로드 실패: ${err.message}`, 'error', 4000);
    }
  }
}

function populateSelect(selector, items, defaultKey) {
  const sel = $(selector);
  sel.innerHTML = '';
  for (const s of items) {
    const opt = document.createElement('option');
    opt.value = s.key;
    opt.textContent = s.label;
    opt.dataset.description = s.description || '';
    if (s.key === defaultKey) opt.selected = true;
    sel.appendChild(opt);
  }
}

function updateStyleDesc() {
  const sel = $('#style-select');
  const opt = sel.options[sel.selectedIndex];
  $('#style-desc').textContent = opt?.dataset.description || '';
}

function updateContentStyleDesc() {
  const sel = $('#content-style-select');
  const opt = sel.options[sel.selectedIndex];
  $('#content-style-desc').textContent = opt?.dataset.description || '';
}

// ────────── 레퍼런스 로드 ──────────
async function loadReferences() {
  try {
    const r = await api('/api/references', { timeoutMs: 5000 });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    state.references = data.references || [];
    populateReferenceSelect('#reference-select', state.references);
    populateReferenceSelect('#ip-reference', state.references);
    updateReferenceDesc();
  } catch (err) {
    // 서버 OFF면 placeholder, 살아있는데 references만 실패면 빈 옵션
    if (__isServerOnline === false) {
      setSelectsToOfflineState();
    } else {
      populateReferenceSelect('#reference-select', []);
      populateReferenceSelect('#ip-reference', []);
    }
    if (!window.__refLoadWarned) {
      window.__refLoadWarned = true;
      toast(`레퍼런스 로드 실패: ${err.message}`, 'error', 2500);
    }
  }
}

function populateReferenceSelect(selector, refs) {
  const sel = $(selector);
  if (!sel) return;
  sel.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = 'none';
  noneOpt.textContent = '없음 (스타일만 사용)';
  noneOpt.dataset.description = '레퍼런스 적용 안 함 — 위에서 선택한 디자인 스타일·내용 스타일로만 생성합니다.';
  sel.appendChild(noneOpt);
  for (const r of refs) {
    const opt = document.createElement('option');
    opt.value = r.key;
    opt.textContent = r.label;
    const tone = Array.isArray(r.tone) && r.tone.length ? ` · ${r.tone.join('·')}` : '';
    opt.dataset.description = `${r.tagline || ''}${tone}`;
    sel.appendChild(opt);
  }
}

function updateReferenceDesc() {
  const sel = $('#reference-select');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  $('#reference-desc').textContent = opt?.dataset.description || '';
}

// ────────── 이미지 처리 ──────────
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const MAX_IMAGES_PER_KIND = 30;

// kind: 'product' | 'reference'
function getImagesArray(kind) {
  return kind === 'product' ? state.productImages : state.referenceImages;
}

async function addImageFile(file, kind) {
  const arr = getImagesArray(kind);
  const labelKo = kind === 'product' ? '제품 사진' : '기타 이미지';
  if (arr.length >= MAX_IMAGES_PER_KIND) {
    toast(`${labelKo}는 최대 ${MAX_IMAGES_PER_KIND}장까지 첨부 가능합니다`, 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    toast(`이미지 파일이 아닙니다: ${file.name}`, 'error');
    return;
  }
  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) {
    toast(`이미지 크기 초과 (20MB): ${file.name}`, 'error');
    return;
  }
  try {
    const dataUrl = await fileToDataURL(file);
    arr.push({
      name: file.name || `pasted_${Date.now()}.png`,
      dataUrl,
      size: file.size,
      description: '', // 사장님 입력 — 이미지 설명 (선택)
    });
    renderImageList(kind);
  } catch (err) {
    toast(`이미지 읽기 실패: ${err.message}`, 'error');
  }
}

function renderImageList(kind) {
  const listEl = $(kind === 'product' ? '#image-list-product' : '#image-list-reference');
  const arr = getImagesArray(kind);
  listEl.innerHTML = '';
  arr.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'image-list__item';
    item.innerHTML = `
      <div class="image-list__thumb">
        <img src="${img.dataUrl}" alt="${escapeHTML(img.name)}" />
        <button type="button" class="image-list__remove" data-idx="${idx}" title="제거">✕</button>
      </div>
      <input type="text"
             class="image-list__desc"
             data-idx="${idx}"
             placeholder="이미지 설명 (선택)"
             title="이 이미지가 무엇인지 적으면 더 정확한 디자인이 가능합니다"
             value="${escapeHTML(img.description || '')}" />
    `;
    listEl.appendChild(item);
  });
  listEl.querySelectorAll('.image-list__remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(e.currentTarget.dataset.idx);
      arr.splice(idx, 1);
      renderImageList(kind);
    });
  });
  listEl.querySelectorAll('.image-list__desc').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      if (arr[idx]) arr[idx].description = e.currentTarget.value;
    });
    // 클릭 시 부모 dropzone 클릭 이벤트로 버블링 안 되게
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousedown', (e) => e.stopPropagation());
  });
}

// fetch 응답이 JSON 이 아닐 때(서버가 HTML 에러페이지를 반환 등) 친절한 객체로 변환
async function safeJSON(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return {
      ok: false,
      error: `서버가 JSON이 아닌 응답을 반환했습니다 (status ${response.status})`,
      detail: text.slice(0, 200),
    };
  }
}

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ────────── Dropzone 이벤트 (kind 인자로 일반화) ──────────
// 마지막으로 hover/포커스/클릭된 dropzone을 추적해 paste 대상으로 사용
let lastFocusedDropzoneKind = 'product';

function setupDropzone(kind) {
  const zone = $(kind === 'product' ? '#dropzone-product' : '#dropzone-reference');
  const input = $(kind === 'product' ? '#file-input-product' : '#file-input-reference');
  // null-safe: 옛 캐시 HTML이라 마크업이 다르면 zone/input이 null일 수 있음 — throw 안 하고 skip
  if (!zone || !input) {
    console.warn(`[setupDropzone] ${kind}: zone 또는 input 누락. drag-drop 비활성.`);
    return;
  }

  const markFocus = () => { lastFocusedDropzoneKind = kind; };
  zone.addEventListener('mouseenter', markFocus);
  zone.addEventListener('focus', markFocus);
  zone.addEventListener('click', () => { markFocus(); input.click(); });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      markFocus();
      input.click();
    }
  });
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await addImageFile(f, kind);
    e.target.value = '';
  });

  ;['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      markFocus();
      zone.classList.add('is-dragover');
    })
  );
  ;['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('is-dragover');
    })
  );
  zone.addEventListener('drop', async (e) => {
    markFocus();
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) await addImageFile(f, kind);
  });
}

// ────────── 클립보드 붙여넣기 ──────────
// 마지막으로 hover/클릭된 dropzone으로 보냄. 기본은 'product'.
function setupPaste() {
  window.addEventListener('paste', async (e) => {
    // Inpaint 모달이 열려있으면 모달 paste 핸들러가 stopImmediatePropagation으로 차단하지만,
    // 안전망으로 여기서도 한 번 더 가드 (capture 단계 핸들러가 어떤 이유로 실패해도 두 번 처리되지 않게)
    const inpaintModal = document.getElementById('inpaint-modal');
    if (inpaintModal && !inpaintModal.hidden) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      return;
    }
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) await addImageFile(file, lastFocusedDropzoneKind);
      }
    }
  });
}

// ────────── 생성 API 호출 ──────────
// ────────── Step 잠금/해제 헬퍼 ──────────
function showStep(n, mode) {
  // mode: 'lock' | 'unlock' | 'done' | 'skipped'
  const el = document.querySelector(`#step-${n}`);
  if (!el) return;
  // skipped 외 전이 시 skipped 표식 제거
  if (mode !== 'skipped') delete el.dataset.skipped;
  if (mode === 'lock')    { el.dataset.locked = 'true';  delete el.dataset.done; }
  if (mode === 'unlock')  { el.dataset.locked = 'false'; delete el.dataset.done; }
  if (mode === 'done')    { el.dataset.locked = 'false'; el.dataset.done = 'true'; }
  if (mode === 'skipped') { el.dataset.locked = 'true';  el.dataset.skipped = 'true'; delete el.dataset.done; }
}

// 진행 중인 액션 중복 방지 — 버튼 비활성화 + state.inflight 플래그
function withInflight(key, btnSelector, fn) {
  return async (...args) => {
    if (state.inflight[key]) {
      toast('이미 처리 중입니다. 잠시만 기다려 주세요.', 'info', 1800);
      return;
    }
    const btn = btnSelector ? $(btnSelector) : null;
    state.inflight[key] = true;
    if (btn) btn.disabled = true;
    try {
      return await fn(...args);
    } finally {
      state.inflight[key] = false;
      if (btn) btn.disabled = false;
    }
  };
}

// ────────── Step 1 → Step 2: /api/plan 호출 (기획 + 이미지 프롬프트) ──────────
async function callPlan() {
  const text = $('#content-text').value.trim();
  const styleKey = $('#style-select').value;
  const contentStyleKey = $('#content-style-select').value;
  const referenceKey = $('#reference-select')?.value || 'none';
  if (!text) {
    toast('상세페이지 내용을 입력해 주세요', 'error');
    return;
  }
  if (!styleKey) {
    toast('디자인 스타일을 선택해 주세요', 'error');
    return;
  }
  setLoading(true, '① 기획·이미지 프롬프트 생성 중... (보통 30초~2분)');
  try {
    const productImgs = state.productImages.map((i) => ({ name: i.name, data: i.dataUrl, description: i.description || '' }));
    const referenceImgs = state.referenceImages.map((i) => ({ name: i.name, data: i.dataUrl, description: i.description || '' }));
    const payload = {
      style_key: styleKey,
      content_style_key: contentStyleKey,
      reference_key: referenceKey,
      text,
      product_images: productImgs,
      reference_images: referenceImgs,
      // 하위호환 — 서버가 product/reference를 모르는 구버전인 경우 합쳐서도 보냄
      images: [...productImgs, ...referenceImgs],
    };
    const r = await api('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 30000, // job_id만 받음
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok) {
      throw new Error((initial.error || `status ${r.status}`) + (initial.detail ? ` (${initial.detail})` : ''));
    }
    // 새 job 패턴: job_id 받으면 폴링, 아니면 구버전 서버 응답 그대로 사용
    let data;
    if (initial.job_id) {
      registerActiveJob(initial.job_id);
      try {
        data = await pollJob(initial.job_id, {
          onProgress: (job) => setLoading(true, `① 기획·이미지 프롬프트 생성 중... (${Math.round((job.elapsed_ms || 0)/1000)}초)`),
        });
      } finally { unregisterActiveJob(initial.job_id); }
    } else {
      data = initial;
    }
    state.plan = data.plan;
    state.slotImages = {};
    // 서버가 저장한 절대 경로 ↔ 원본 dataUrl 매핑 — 프롬프트 카드 썸네일에서 사용
    state.attachedPathMap = {};
    const productPaths = Array.isArray(data.product_image_paths) ? data.product_image_paths : [];
    const referencePaths = Array.isArray(data.reference_image_paths) ? data.reference_image_paths : [];
    productPaths.forEach((p, i) => {
      const src = state.productImages[i];
      if (src) state.attachedPathMap[normalizePath(p)] = { dataUrl: src.dataUrl, name: src.name, kind: 'product' };
    });
    referencePaths.forEach((p, i) => {
      const src = state.referenceImages[i];
      if (src) state.attachedPathMap[normalizePath(p)] = { dataUrl: src.dataUrl, name: src.name, kind: 'reference' };
    });
    // v0.7 — Step unlock을 렌더링보다 먼저 호출. 렌더가 부분 실패해도 사장님이 Step 2 만질 수 있게.
    showStep(1, 'done');
    showStep(2, 'unlock');
    showStep(3, 'unlock');
    showStep(4, 'unlock');
    // 슬롯 메타 추출 + 슬러그 생성 (output 폴더명) — 각각 try/catch로 격리해 한쪽 실패가 다른 쪽 막지 않게
    try {
      state.slug = makeSessionSlug(data.plan);
      state.approvalSlots = buildApprovalSlotsFromPlan(data.plan);
    } catch (e) {
      console.error('[plan] 슬롯 메타 추출 실패:', e);
      state.approvalSlots = [];
    }
    try { renderApprovalGrid(); } catch (e) { console.error('[plan] renderApprovalGrid 실패:', e); }
    try { renderPlanCards(data.plan); } catch (e) { console.error('[plan] renderPlanCards 실패:', e); }
    try { renderManualSlotCards(data.plan); } catch (e) { console.error('[plan] renderManualSlotCards 실패:', e); }
    // 부드러운 스크롤로 Step 2 안내
    document.querySelector('#step-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (state.approvalSlots.length) {
      toast(`기획 완성 — ${state.approvalSlots.length}개 이미지 슬롯. 승인 후 Higgsfield로 일괄 생성하세요.`, 'success', 3500);
    } else {
      toast('기획 완성 — 이번 기획은 새 이미지 생성이 필요 없습니다.', 'success', 3500);
    }
  } catch (err) {
    toast(`기획 실패: ${err.message}`, 'error', 6000);
    console.error('[callPlan] 실패:', err);
  } finally {
    setLoading(false);
  }
}

// ────────── Step 2 렌더링 — 기획 요약 + 프롬프트 카드 ──────────
function renderPlanCards(plan) {
  // 핵심 셀렉터 null-safe (v0.7.2 마크업 교체로 #prompt-toolbar 제거됨 — 옛 fallback 흐름과 호환)
  const summaryEl = $('#plan-summary');
  const cards = $('#prompt-cards');
  const toolbar = $('#prompt-toolbar');  // v0.7.2부터 null. fallback details 안의 .result-toolbar로 대체.
  if (!cards) {
    // fallback details 자체가 없으면 렌더 skip (Step 2가 잠기지 않게 throw 안 함)
    return;
  }
  cards.innerHTML = '';
  const reqs = Array.isArray(plan?.image_requests) ? plan.image_requests : [];
  const secs = Array.isArray(plan?.sections) ? plan.sections : [];
  if (summaryEl) {
    summaryEl.hidden = false;
    summaryEl.innerHTML = `<strong>흐름 요약:</strong> ${escapeHTML(plan?.summary || '(요약 없음)')}<br>` +
      `<strong>섹션 수:</strong> ${secs.length} · <strong>새로 만들 이미지:</strong> ${reqs.length}건`;
  }

  if (!reqs.length) {
    cards.innerHTML = '<p class="muted">이번 기획에는 새로 만들 이미지가 없습니다 (기존 참고 이미지로 충분).</p>';
    if (toolbar) toolbar.hidden = true;
    return;
  }
  if (toolbar) toolbar.hidden = false;
  reqs.forEach((req, i) => {
    const card = document.createElement('div');
    card.className = 'prompt-card';

    // 3-모드 뱃지 결정 — prompt_mode 우선, 없으면 attach_image_path의 kind로 정확히 분기
    let mode = req.prompt_mode;
    if (!mode) {
      if (req.attach_image_path) {
        const matched = state.attachedPathMap[normalizePath(req.attach_image_path)];
        if (matched?.kind === 'reference') mode = 'reference_based';
        else mode = 'product_based';  // 매칭 안 되거나 product → 안전 기본값
      } else {
        mode = 'new_image';
      }
    }
    const MODE_LABELS = {
      new_image:       { emoji: '🆕', text: '신규 이미지 생성 — ChatGPT 단독',           cls: 'new' },
      product_based:   { emoji: '📎', text: '메인 제품 기준 — 제품 사진 첨부 + 배경 변경', cls: 'product' },
      reference_based: { emoji: '🖼️', text: '서브 사진 보완 — 기타 이미지 첨부 + 변형',    cls: 'reference' },
    };
    const m = MODE_LABELS[mode] || MODE_LABELS.new_image;
    const modeBadge = `<span class="prompt-card__mode prompt-card__mode--${m.cls}">${m.emoji} ${m.text}</span>`;

    // 첨부 모드면 ChatGPT에 같이 보낼 사진 안내 + 썸네일
    let attachBlock = '';
    if (req.attach_image_path) {
      const matched = state.attachedPathMap[normalizePath(req.attach_image_path)];
      const fileName = String(req.attach_image_path).split(/[\\/]/).pop();
      const thumbHtml = matched
        ? `<img class="prompt-card__attach-thumb" src="${matched.dataUrl}" alt="${escapeHTML(matched.name)}">`
        : '<div class="prompt-card__attach-thumb prompt-card__attach-thumb--missing">미리보기 없음</div>';
      const matchedName = matched ? escapeHTML(matched.name) : escapeHTML(fileName);
      const kindLabel = matched?.kind === 'product' ? '제품 사진' : (matched?.kind === 'reference' ? '기타 이미지' : '첨부 이미지');
      attachBlock = `
        <div class="prompt-card__attach prompt-card__attach--${m.cls}">
          <div class="prompt-card__attach-icon">📎</div>
          ${thumbHtml}
          <div class="prompt-card__attach-text">
            <div class="prompt-card__attach-title">ChatGPT에 이 ${kindLabel}을 같이 첨부해 주세요</div>
            <div class="prompt-card__attach-file"><code>${matchedName}</code></div>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="prompt-card__head">
        <div>
          <span class="prompt-card__title">${escapeHTML(req.role_ko || req.slug)}</span>
          ${modeBadge}
          <div class="prompt-card__meta">slug: <code>${escapeHTML(req.slug)}</code> · 섹션 ${escapeHTML(String(req.section_n ?? '-'))} · ${escapeHTML(req.aspect || '')} ${req.size_hint ? '· ' + escapeHTML(req.size_hint) : ''}</div>
        </div>
      </div>
      ${attachBlock}
      ${req.prompt_kr ? `<div class="prompt-card__kr">${escapeHTML(req.prompt_kr)}</div>` : ''}
      <pre class="prompt-card__body">${escapeHTML(req.prompt_en || '')}</pre>
      <div class="prompt-card__actions">
        <button class="btn btn--ghost" data-action="copy-en" data-idx="${i}">📋 영문 프롬프트 복사</button>
      </div>
    `;
    cards.appendChild(card);
  });
  cards.querySelectorAll('button[data-action="copy-en"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      const req = reqs[idx];
      copyToClipboard(req?.prompt_en || '');
    });
  });
}

function copyAllPrompts() {
  if (!state.plan?.image_requests?.length) {
    toast('복사할 프롬프트가 없습니다', 'error');
    return;
  }
  const all = state.plan.image_requests.map((r, i) =>
    `=== ${i + 1}. ${r.role_ko || r.slug} (slug: ${r.slug}) ===\n[${r.aspect || ''} ${r.size_hint || ''}]\n${r.prompt_en || ''}\n`
  ).join('\n');
  copyToClipboard(all);
}

function downloadPromptsTxt() {
  if (!state.plan?.image_requests?.length) {
    toast('다운로드할 프롬프트가 없습니다', 'error');
    return;
  }
  const all = state.plan.image_requests.map((r, i) =>
    `=== ${i + 1}. ${r.role_ko || r.slug} (slug: ${r.slug}) ===\n` +
    `aspect: ${r.aspect || ''}  size: ${r.size_hint || ''}\n` +
    `한글 메모: ${r.prompt_kr || ''}\n\n${r.prompt_en || ''}\n`
  ).join('\n──────────────────────────────\n\n');
  const blob = new Blob([all], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kozon_prompts_${Date.now()}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ────────── Step 3 (fallback) — 수동 업로드 드롭존 그리드 ──────────
// v0.7: 메인은 자동 생성 결과 그리드. 이건 details fallback 안에서만 동작.
function renderManualSlotCards(plan) {
  const grid = $('#manual-slot-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const reqs = Array.isArray(plan?.image_requests) ? plan.image_requests : [];
  if (!reqs.length) {
    grid.innerHTML = '<p class="muted">필요 이미지 없음 — 바로 Step 4로 진행하세요.</p>';
    updateSlotProgress();
    return;
  }
  reqs.forEach((req) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.dataset.slug = req.slug;
    card.innerHTML = `
      <button class="slot-card__remove" type="button" title="제거">✕</button>
      <div class="slot-card__title">${escapeHTML(req.role_ko || req.slug)}</div>
      <div class="slot-card__meta">slug · ${escapeHTML(req.slug)}<br>${escapeHTML(req.aspect || '')}</div>
      <div class="slot-card__preview">이미지 드롭</div>
    `;
    grid.appendChild(card);
    setupSlotDropzone(card, req.slug);
  });
  updateSlotProgress();
}

// 하위호환 — 기존 호출 지점이 있을 수 있으므로 별칭 유지
function renderSlotCards(plan) { return renderManualSlotCards(plan); }

// ═════════════════════════════════════════════════════════════
// v0.7 — Higgsfield 자동 생성 흐름 (Step 2 승인 → Step 3 결과)
// ═════════════════════════════════════════════════════════════

// slug sanitize — 서버 inpaintStore.assertSafeName 정책과 일치 ([a-zA-Z0-9._\-가-힣], 80자)
function sanitizeSlotIdClient(raw, fallback) {
  const s = String(raw == null ? '' : raw)
    .replace(/[\\/]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9._\-가-힣]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return s || fallback;
}

// output 폴더용 slug — 세션마다 고유. plan.id가 있으면 사용, 없으면 timestamp.
function makeSessionSlug(plan) {
  const fromPlan = plan && (plan.slug || plan.id) ? String(plan.slug || plan.id) : null;
  const base = fromPlan
    ? sanitizeSlotIdClient(fromPlan, '')
    : `session_${new Date().toISOString().replace(/[:.TZ\-]/g, '').slice(0, 14)}`;
  return base || `session_${Date.now()}`;
}

// plan.image_requests → 승인 슬롯 메타 변환
function buildApprovalSlotsFromPlan(plan) {
  const reqs = Array.isArray(plan?.image_requests) ? plan.image_requests : [];
  return reqs.map((req, idx) => {
    const rawId = req.slug || `slot_${String(idx + 1).padStart(2, '0')}`;
    const id = sanitizeSlotIdClient(rawId, `slot_${String(idx + 1).padStart(2, '0')}`);
    // aspect "1:1" 형식 유지, 아니면 3:4 기본
    const ratio = /^\d+:\d+$/.test(String(req.aspect || '').trim()) ? req.aspect.trim() : '3:4';
    return {
      id,
      originalSlug: req.slug || id,   // /api/generate의 image_slug 매칭용 — sanitize 전 원본
      sectionIndex: req.section_n || (idx + 1),
      sectionName: req.role_ko || req.slug || `섹션 ${idx + 1}`,
      koDesc: req.prompt_kr || req.role_ko || req.slug || `섹션 ${idx + 1} 이미지`,
      enPrompt: req.prompt_en || '',
      model: 'gpt-image-2',
      ratio,
      // v0.7.10 — 사장님 첨부 사진을 Higgsfield 호출까지 전달.
      // plan에서 Claude가 product_based/reference_based 슬롯에 사장님 사진 경로를
      // attach_image_path로 매핑해놨는데, 이전 코드는 그 정보를 누락해 Higgsfield가
      // 사장님 사진 모르고 새 이미지만 생성. 이제 슬롯에 보존해 generate-png 호출 시 전달.
      promptMode: req.prompt_mode || (req.attach_image_path ? 'attached' : 'new_image'),
      attachImagePath: req.attach_image_path || null,
      approved: true,             // 기본 전체 승인 (사장님은 거절할 것만 빠르게 ✗)
      status: 'pending',          // pending | generating | success | failed
      error: null,
    };
  });
}

function refreshApprovalSummary() {
  const total = state.approvalSlots.length;
  const ok = state.approvalSlots.filter(s => s.approved === true).length;
  const bad = state.approvalSlots.filter(s => s.approved === false).length;
  $('#approval-total') && ($('#approval-total').textContent = total);
  $('#approval-approved') && ($('#approval-approved').textContent = ok);
  $('#approval-rejected') && ($('#approval-rejected').textContent = bad);
  const btn = $('#btn-higgsfield-generate');
  if (btn) btn.disabled = ok === 0;
}

function renderApprovalGrid() {
  const grid = $('#approval-grid');
  const toolbar = $('#approval-toolbar');
  const fallback = $('#prompt-fallback');
  if (!grid) return;
  grid.innerHTML = '';
  if (!state.approvalSlots.length) {
    grid.innerHTML = '<p class="muted">이번 기획에는 새로 만들 이미지가 없습니다. 바로 Step 4로 진행하세요.</p>';
    if (toolbar) toolbar.hidden = true;
    if (fallback) fallback.hidden = true;
    return;
  }
  if (toolbar) toolbar.hidden = false;
  if (fallback) fallback.hidden = false;
  state.approvalSlots.forEach((slot, idx) => {
    const card = document.createElement('div');
    card.className = 'approval-card' + (slot.approved === true ? ' is-approved' : slot.approved === false ? ' is-rejected' : '');
    card.dataset.id = slot.id;
    card.innerHTML = `
      <div class="approval-card__idx">${String(slot.sectionIndex || (idx + 1)).padStart(2, '0')}</div>
      <div class="approval-card__body">
        <div class="approval-card__name">${escapeHTML(slot.sectionName || slot.id)}</div>
        <div class="approval-card__desc">${escapeHTML(slot.koDesc || '(설명 없음)')}</div>
        <div class="approval-card__meta">
          <span>모델:</span>
          <select data-field="model">
            <option value="gpt-image-2"${slot.model === 'gpt-image-2' ? ' selected' : ''}>GPT Image 2</option>
            <option value="soul-2"${slot.model === 'soul-2' ? ' selected' : ''}>Soul 2.0</option>
            <option value="nano-banana-pro"${slot.model === 'nano-banana-pro' ? ' selected' : ''}>Nano Banana Pro</option>
            <option value="seedream-4"${slot.model === 'seedream-4' ? ' selected' : ''}>Seedream 4</option>
            <option value="flux-2-pro"${slot.model === 'flux-2-pro' ? ' selected' : ''}>Flux 2 Pro</option>
          </select>
          <span style="margin-left:6px;">비율:</span>
          <select data-field="ratio">
            <option value="3:4"${slot.ratio === '3:4' ? ' selected' : ''}>3:4 (세로)</option>
            <option value="1:1"${slot.ratio === '1:1' ? ' selected' : ''}>1:1 (정사각)</option>
            <option value="16:9"${slot.ratio === '16:9' ? ' selected' : ''}>16:9 (가로)</option>
            <option value="2:3"${slot.ratio === '2:3' ? ' selected' : ''}>2:3 (세로)</option>
            <option value="9:16"${slot.ratio === '9:16' ? ' selected' : ''}>9:16 (모바일)</option>
            <option value="4:5"${slot.ratio === '4:5' ? ' selected' : ''}>4:5</option>
          </select>
        </div>
      </div>
      <div class="approval-card__actions">
        <button class="toggle-btn ok${slot.approved === true ? ' active' : ''}" type="button" title="승인">✓</button>
        <button class="toggle-btn bad${slot.approved === false ? ' active' : ''}" type="button" title="거절">✗</button>
      </div>
    `;
    grid.appendChild(card);
    card.querySelector('.toggle-btn.ok').addEventListener('click', () => {
      slot.approved = slot.approved === true ? null : true;
      renderApprovalGrid();
    });
    card.querySelector('.toggle-btn.bad').addEventListener('click', () => {
      slot.approved = slot.approved === false ? null : false;
      renderApprovalGrid();
    });
    card.querySelector('select[data-field="model"]').addEventListener('change', (e) => {
      slot.model = e.target.value;
    });
    card.querySelector('select[data-field="ratio"]').addEventListener('change', (e) => {
      slot.ratio = e.target.value;
    });
  });
  refreshApprovalSummary();
}

function approveAllSlots(value) {
  state.approvalSlots.forEach(s => { s.approved = value === false ? false : true; });
  renderApprovalGrid();
}

// ── Step 3 결과 그리드 (자동 생성 PNG 표시) ──
function renderResultGrid() {
  const grid = $('#slot-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const approvedSlots = state.approvalSlots.filter(s => s.approved === true);
  if (!approvedSlots.length) {
    grid.innerHTML = '<p class="muted">승인된 슬롯이 없습니다. Step 2에서 슬롯을 ✓ 해주세요.</p>';
    return;
  }
  approvedSlots.forEach((slot) => {
    const card = document.createElement('div');
    const stateCls = slot.status === 'success' ? ' is-success'
                   : slot.status === 'failed'  ? ' is-failed'
                   : slot.status === 'generating' ? ' is-generating'
                   : '';
    card.className = 'slot-card' + stateCls;
    card.dataset.slug = slot.id;

    // 자동 생성된 PNG가 있으면 미리보기, 없으면 placeholder
    const haveImage = state.slotImages[slot.originalSlug || slot.id]?.dataUrl;
    const previewHtml = haveImage
      ? `<img src="${haveImage}" alt="${escapeHTML(slot.sectionName)}">`
      : (slot.status === 'failed'
          ? `<div class="slot-card__error">실패<br>${escapeHTML((slot.error || '알 수 없는 오류').slice(0, 80))}</div>`
          : (slot.status === 'generating' ? '생성 중…' : '대기'));

    card.innerHTML = `
      <div class="slot-card__title">${escapeHTML(slot.sectionName || slot.id)}</div>
      <div class="slot-card__meta">slug · ${escapeHTML(slot.id)}<br>${escapeHTML(slot.ratio || '')}</div>
      <div class="slot-card__preview">${previewHtml}</div>
      <div class="slot-card__overlay">
        ${haveImage ? `<button class="btn--mini" data-action="inpaint" type="button">✏️ 수정</button>` : ''}
        ${haveImage ? `<button class="btn--mini" data-action="zoom" type="button">⤴ 크게</button>` : ''}
        <button class="btn--mini" data-action="regen" type="button">🔄 ${haveImage ? '재생성' : '재시도'}</button>
      </div>
    `;
    grid.appendChild(card);
    card.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'inpaint') openInpaintModal(slot.id);
        else if (action === 'zoom') zoomSlotImage(slot);
        else if (action === 'regen') regenerateSingleSlot(slot.id);
      });
    });
  });
  updateSlotProgress();
}

function zoomSlotImage(slot) {
  const dataUrl = state.slotImages[slot.originalSlug || slot.id]?.dataUrl;
  if (!dataUrl) { toast('이미지 없음', 'error'); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('팝업이 차단됐습니다', 'error'); return; }
  w.document.write(`<title>${escapeHTML(slot.sectionName)} · ${escapeHTML(slot.id)}</title><body style="margin:0;background:#000;display:grid;place-items:center;min-height:100vh"><img src="${dataUrl}" style="max-width:100%;max-height:100vh"></body>`);
}

function setGenerationStatus(message, pct, show = true) {
  const box = $('#generation-status');
  const msg = $('#generation-status-msg');
  const fill = $('#generation-progress-fill');
  if (!box) return;
  box.hidden = !show;
  if (msg && message != null) msg.textContent = message;
  if (fill && pct != null) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

// ── 메인: Higgsfield 일괄 생성 ──
async function callHiggsfieldGenerate() {
  if (!state.plan) { toast('먼저 ① 기획을 진행하세요', 'error'); return; }
  const approved = state.approvalSlots.filter(s => s.approved === true);
  if (!approved.length) { toast('승인된 슬롯이 없습니다', 'error'); return; }
  if (!state.slug) state.slug = makeSessionSlug(state.plan);

  const styleKey = $('#style-select')?.value || state.defaultStyle;
  approved.forEach(s => { s.status = 'generating'; s.error = null; });
  renderResultGrid();
  setGenerationStatus(`${approved.length}개 슬롯 생성 요청 중…`, 5);
  document.querySelector('#step-3')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const r = await api('/api/v07/generate-png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: state.slug,
        style_key: styleKey,
        slots: approved.map(s => ({
          id: s.id,
          sectionName: s.sectionName,
          enPrompt: s.enPrompt,
          model: s.model,
          ratio: s.ratio,
          // v0.7.10 — 사장님 첨부 사진 정보 (Higgsfield base image로 사용)
          promptMode: s.promptMode || null,
          attachImagePath: s.attachImagePath || null,
        })),
      }),
      timeoutMs: 30000,
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok) {
      throw new Error((initial.error || `status ${r.status}`) + (initial.detail ? ` (${initial.detail})` : ''));
    }
    if (!initial.job_id) throw new Error('job_id 없음');
    state.generateJobId = initial.job_id;
    registerActiveJob(initial.job_id);
    try {
      const data = await pollJob(initial.job_id, {
        interval: 1500,
        maxMs: 30 * 60 * 1000,
        onProgress: (job) => {
          const sec = Math.round((job.elapsed_ms || 0) / 1000);
          // 진행률 추정 — done 전까지는 max 85
          const pct = Math.min(85, 10 + sec * 1.5);
          setGenerationStatus(`Higgsfield 생성 중… (${sec}초 / ${approved.length}개 슬롯)`, pct);
        },
      });
      await handleGenerateResult(data, approved);
    } finally {
      unregisterActiveJob(initial.job_id);
    }
  } catch (err) {
    console.error('[higgsfield-generate]', err);
    approved.forEach(s => { if (s.status === 'generating') { s.status = 'failed'; s.error = err.message; } });
    renderResultGrid();
    setGenerationStatus(`생성 실패: ${err.message}`, 0);
    toast(`Higgsfield 생성 실패: ${err.message}`, 'error', 8000);
  }
}

// 단일 슬롯 재생성
async function regenerateSingleSlot(slotId) {
  const slot = state.approvalSlots.find(s => s.id === slotId);
  if (!slot) { toast('슬롯 정보 없음', 'error'); return; }
  slot.status = 'generating';
  slot.error = null;
  renderResultGrid();
  try {
    const r = await api('/api/v07/generate-png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: state.slug,
        style_key: $('#style-select')?.value || state.defaultStyle,
        slots: [{
          id: slot.id, sectionName: slot.sectionName, enPrompt: slot.enPrompt,
          model: slot.model, ratio: slot.ratio,
          promptMode: slot.promptMode || null,
          attachImagePath: slot.attachImagePath || null,
        }],
      }),
      timeoutMs: 30000,
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok || !initial.job_id) throw new Error(initial.error || `status ${r.status}`);
    registerActiveJob(initial.job_id);
    try {
      const data = await pollJob(initial.job_id, { interval: 1500, maxMs: 10 * 60 * 1000 });
      await handleGenerateResult(data, [slot]);
    } finally { unregisterActiveJob(initial.job_id); }
    toast(`${slot.id} 재생성 완료`, 'success', 2500);
  } catch (err) {
    slot.status = 'failed';
    slot.error = err.message;
    renderResultGrid();
    toast(`${slot.id} 재생성 실패: ${err.message}`, 'error');
  }
}

// 서버 job 결과 → state.slotImages 채움 + 카드 갱신
async function handleGenerateResult(data, slotsScope) {
  if (!data || !Array.isArray(data.results)) {
    setGenerationStatus('서버 응답 형식 오류', 0);
    return;
  }
  let okCount = 0;
  let failCount = 0;
  for (const r of data.results) {
    const slot = slotsScope.find(s => s.id === r.slot) || state.approvalSlots.find(s => s.id === r.slot);
    if (!slot) continue;
    if (r.ok) {
      try {
        const dataUrl = await fetchPngAsDataUrl(`/output/${encodeURIComponent(state.slug)}/${encodeURIComponent(r.slot)}.png?t=${Date.now()}`);
        // 키는 plan.image_requests.slug(=originalSlug) 사용 — /api/generate 매칭용
        state.slotImages[slot.originalSlug || slot.id] = {
          name: `${slot.id}.png`,
          dataUrl,
        };
        slot.status = 'success';
        slot.error = null;
        okCount += 1;
      } catch (e) {
        slot.status = 'failed';
        slot.error = `이미지 다운로드 실패: ${e.message}`;
        failCount += 1;
      }
    } else {
      slot.status = 'failed';
      slot.error = r.error || '생성 실패';
      failCount += 1;
    }
  }
  renderResultGrid();
  const total = slotsScope.length;
  const totalSec = Math.round((data.elapsed_ms || 0) / 1000);
  if (failCount === 0) {
    setGenerationStatus(`✓ ${okCount}/${total}개 성공 (${totalSec}초)`, 100);
    toast(`Higgsfield 생성 완료 — ${okCount}개 슬롯`, 'success', 3500);
  } else {
    setGenerationStatus(`⚠ 성공 ${okCount} · 실패 ${failCount} (총 ${total}개, ${totalSec}초)`, 100);
    toast(`일부 실패 — 실패 카드 🔄 재생성으로 다시 시도`, 'info', 5000);
  }
}

// 서버에 저장된 /output/.../slot.png → dataURL 변환 (state.slotImages용)
async function fetchPngAsDataUrl(urlPath) {
  const resp = await fetch(`${API_BASE}${urlPath}`);
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const blob = await resp.blob();
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

// ── Inpaint 모달 ──
async function openInpaintModal(slotId) {
  if (!state.slug) { toast('세션 slug 없음', 'error'); return; }
  state.currentInpaintSlot = slotId;
  try {
    const r = await api('/api/v07/inpaint/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: state.slug, slotId }),
      timeoutMs: 15000,
    });
    const data = await safeJSON(r);
    if (!r.ok || !data.ok) throw new Error(data.error || `status ${r.status}`);
    const slot = state.approvalSlots.find(s => s.id === slotId);
    $('#inpaint-modal-title').textContent = `✏️ ${slot?.sectionName || slotId}`;
    $('#inpaint-modal-sub').textContent = `슬롯 · ${slotId}`;
    $('#inpaint-modal-img').src = data.clipboardData;
    $('#inpaint-modal').hidden = false;
    // 클립보드 자동 복사 (실패해도 진행)
    try {
      const resp = await fetch(data.clipboardData);
      const blob = await resp.blob();
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast('클립보드에 이미지 복사됨', 'success', 1800);
      }
    } catch (e) {
      console.warn('[inpaint] 클립보드 복사 실패', e);
    }
  } catch (err) {
    toast(`Inpaint 열기 실패: ${err.message}`, 'error');
  }
}

function closeInpaintModal() {
  $('#inpaint-modal').hidden = true;
  state.currentInpaintSlot = null;
}

async function applyInpaintFile(file) {
  if (!state.currentInpaintSlot) { toast('수정할 슬롯 없음', 'error'); return; }
  if (!file.type.startsWith('image/')) { toast('이미지가 아닙니다', 'error'); return; }
  try {
    const dataUrl = await fileToDataURL(file);
    const r = await api('/api/v07/inpaint/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: state.slug,
        slotId: state.currentInpaintSlot,
        newImageBase64: dataUrl,
      }),
      timeoutMs: 30000,
    });
    const data = await safeJSON(r);
    if (!r.ok || !data.ok) throw new Error(data.error || `status ${r.status}`);
    // state.slotImages 갱신 (cache buster 포함 재 fetch)
    const slot = state.approvalSlots.find(s => s.id === state.currentInpaintSlot);
    if (slot) {
      try {
        const refreshed = await fetchPngAsDataUrl(`/output/${encodeURIComponent(state.slug)}/${encodeURIComponent(slot.id)}.png?t=${Date.now()}`);
        state.slotImages[slot.originalSlug || slot.id] = { name: `${slot.id}.png`, dataUrl: refreshed };
      } catch (_) {
        // 실패 시 클라이언트가 방금 올린 dataUrl로 fallback
        state.slotImages[slot.originalSlug || slot.id] = { name: `${slot.id}.png`, dataUrl };
      }
      slot.status = 'success';
    }
    toast(`v${data.total_versions || '+'}로 교체됨`, 'success');
    closeInpaintModal();
    renderResultGrid();
  } catch (err) {
    toast(`적용 실패: ${err.message}`, 'error');
  }
}

async function rollbackInpaint() {
  if (!state.currentInpaintSlot) return;
  try {
    const infoR = await api(`/api/v07/slot?slug=${encodeURIComponent(state.slug)}&slot=${encodeURIComponent(state.currentInpaintSlot)}`);
    const info = await safeJSON(infoR);
    if (!infoR.ok || !info.ok) throw new Error(info.error || `status ${infoR.status}`);
    if (!info.versions || !info.versions.length) { toast('이전 버전이 없습니다', 'info'); return; }
    const target = info.versions[info.versions.length - 1].version;
    const r = await api('/api/v07/inpaint/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: state.slug, slotId: state.currentInpaintSlot, version: target }),
      timeoutMs: 15000,
    });
    const data = await safeJSON(r);
    if (!r.ok || !data.ok) throw new Error(data.error || `status ${r.status}`);
    // 다시 받아 상태 갱신
    const slot = state.approvalSlots.find(s => s.id === state.currentInpaintSlot);
    if (slot) {
      const refreshed = await fetchPngAsDataUrl(`/output/${encodeURIComponent(state.slug)}/${encodeURIComponent(slot.id)}.png?t=${Date.now()}`);
      state.slotImages[slot.originalSlug || slot.id] = { name: `${slot.id}.png`, dataUrl: refreshed };
    }
    toast(`v${target}로 복원됨`, 'success');
    closeInpaintModal();
    renderResultGrid();
  } catch (err) {
    toast(`롤백 실패: ${err.message}`, 'error');
  }
}

function setupInpaintModal() {
  const modal = $('#inpaint-modal');
  if (!modal) return;
  $('#inpaint-modal-close')?.addEventListener('click', closeInpaintModal);
  $('#btn-inpaint-cancel')?.addEventListener('click', closeInpaintModal);
  $('#btn-inpaint-rollback')?.addEventListener('click', rollbackInpaint);
  $('#btn-open-higgsfield')?.addEventListener('click', () => {
    window.open('https://higgsfield.ai/image/inpaint', '_blank');
    toast('Higgsfield 새 탭 열림 — Ctrl+V로 붙여넣기', 'info', 2500);
  });
  // 모달 바깥 클릭 시 닫기
  modal.addEventListener('click', (e) => { if (e.target === modal) closeInpaintModal(); });
  // Esc 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeInpaintModal();
  });
  // Dropzone
  const drop = $('#inpaint-dropzone');
  if (drop) {
    ;['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); drop.classList.add('is-dragover');
    }));
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-dragover');
      const f = e.dataTransfer?.files?.[0];
      if (f) applyInpaintFile(f);
    });
    drop.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        if (f) applyInpaintFile(f);
      });
      input.click();
    });
  }
  // Paste — 모달 열려있을 때만. capture 단계로 등록해 setupPaste의 글로벌 핸들러보다 먼저 실행.
  // 모달 열림 상태에서 이미지 paste 시 inpaint로만 흘러가고, 좌측 dropzone(productImages) paste는 차단.
  document.addEventListener('paste', (e) => {
    if (modal.hidden) return;
    const items = (e.clipboardData || {}).items || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          e.stopPropagation();
          // 같은 element에 등록된 후속 listener(setupPaste의 글로벌 paste)도 차단
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          applyInpaintFile(f);
          return;
        }
      }
    }
  }, true);   // ← capture: true
}

function setupSlotDropzone(card, slug) {
  const remove = card.querySelector('.slot-card__remove');
  card.addEventListener('click', (e) => {
    if (e.target === remove) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (f) await assignSlot(card, slug, f);
    });
    input.click();
  });
  ;['dragenter', 'dragover'].forEach((ev) =>
    card.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); card.classList.add('is-dragover'); })
  );
  ;['dragleave'].forEach((ev) =>
    card.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); card.classList.remove('is-dragover'); })
  );
  card.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    card.classList.remove('is-dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) await assignSlot(card, slug, f);
  });
  remove.addEventListener('click', (e) => {
    e.stopPropagation();
    delete state.slotImages[slug];
    card.classList.remove('is-filled');
    card.querySelector('.slot-card__preview').innerHTML = '이미지 드롭';
    updateSlotProgress();
  });
}

async function assignSlot(card, slug, file) {
  if (!file.type.startsWith('image/')) { toast('이미지 파일이 아닙니다', 'error'); return; }
  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) { toast('이미지 크기 초과 (20MB)', 'error'); return; }
  try {
    const dataUrl = await fileToDataURL(file);
    state.slotImages[slug] = { name: file.name, dataUrl };
    const preview = card.querySelector('.slot-card__preview');
    preview.innerHTML = `<img src="${dataUrl}" alt="${escapeHTML(file.name)}">`;
    card.classList.add('is-filled');
    updateSlotProgress();
  } catch (err) {
    toast(`슬롯 매칭 실패: ${err.message}`, 'error');
  }
}

function updateSlotProgress() {
  const total = state.plan?.image_requests?.length || 0;
  const filled = Object.keys(state.slotImages).length;
  const el = $('#slot-progress');
  if (!el) return;
  if (!total) {
    el.textContent = '이번 기획엔 슬롯이 없습니다.';
    return;
  }
  el.textContent = `${filled} / ${total} 슬롯 채움 — 비어있는 슬롯은 placeholder로 처리됩니다.`;
}

// ────────── Step 1 → Step 4 직행: /api/generate (plan 없이) ──────────
// 사장님이 이미지를 모두 가지고 있을 때, Step 2/3을 건너뛰고 곧장 HTML 생성·다운로드.
async function callDirectGenerate() {
  const text = $('#content-text').value.trim();
  const styleKey = $('#style-select').value;
  const contentStyleKey = $('#content-style-select').value;
  const referenceKey = $('#reference-select')?.value || 'none';
  if (!text) {
    toast('상세페이지 내용을 입력해 주세요', 'error');
    return;
  }
  if (!styleKey) {
    toast('디자인 스타일을 선택해 주세요', 'error');
    return;
  }
  if (state.productImages.length === 0 && state.referenceImages.length === 0) {
    toast('첨부 이미지가 없습니다. 이미지를 먼저 추가하시거나, "① 기획 + 이미지 프롬프트 생성"으로 진행해 주세요.', 'error', 5500);
    return;
  }
  // ⚡ 2단계 자동 연쇄: plan(짧음) → generate(짧음)
  // 단일 큰 호출(plan=null)이 timeout 자주 발생 → LLM에 명확한 두 작업으로 분산해 안정성·속도 모두 개선
  clearErrorBox();
  markDownloadState('pending');
  showStep(1, 'done');
  showStep(2, 'lock');
  showStep(3, 'skipped');
  showStep(4, 'lock');
  const productImgsBase = state.productImages.map((i) => ({ name: i.name, data: i.dataUrl, description: i.description || '' }));
  const referenceImgsBase = state.referenceImages.map((i) => ({ name: i.name, data: i.dataUrl, description: i.description || '' }));
  const t0 = performance.now();

  // ── 1/2: plan ──────────────────────────────────────────────
  let plan = null;
  try {
    setLoading(true, '⚡ 1/2 — 기획·이미지 매칭 중... (보통 30초~2분)');
    const planPayload = {
      style_key: styleKey,
      content_style_key: contentStyleKey,
      reference_key: referenceKey,
      text,
      product_images: productImgsBase,
      reference_images: referenceImgsBase,
    };
    console.log('[direct-generate:1/2 plan] 요청 시작', { product: productImgsBase.length, reference: referenceImgsBase.length, 카피길이: text.length });
    const r = await api('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planPayload),
      timeoutMs: 30000, // job_id만 받음
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok) {
      throw new Error((initial.error || `status ${r.status}`) + (initial.detail ? ` (${initial.detail})` : ''));
    }
    let data;
    if (initial.job_id) {
      registerActiveJob(initial.job_id);
      try {
        data = await pollJob(initial.job_id, {
          onProgress: (job) => setLoading(true, `⚡ 1/2 — 기획·이미지 매칭 중... (${Math.round((job.elapsed_ms || 0)/1000)}초)`),
        });
      } finally { unregisterActiveJob(initial.job_id); }
    } else {
      data = initial;
    }
    const elapsed1 = Math.round(performance.now() - t0);
    console.log(`[direct-generate:1/2 plan] 완료 ${elapsed1}ms`, { sections: data.plan?.sections?.length, image_requests: data.plan?.image_requests?.length });
    plan = data.plan;
    state.plan = plan;
    state.slotImages = {};
    state.slug = makeSessionSlug(plan);
    state.approvalSlots = buildApprovalSlotsFromPlan(plan);
    // attachedPathMap 빌드 (혹시 사장님이 결과 영역에서 카드 보게 되면 썸네일 매칭용)
    state.attachedPathMap = {};
    (data.product_image_paths || []).forEach((p, i) => {
      const src = state.productImages[i];
      if (src) state.attachedPathMap[normalizePath(p)] = { dataUrl: src.dataUrl, name: src.name, kind: 'product' };
    });
    (data.reference_image_paths || []).forEach((p, i) => {
      const src = state.referenceImages[i];
      if (src) state.attachedPathMap[normalizePath(p)] = { dataUrl: src.dataUrl, name: src.name, kind: 'reference' };
    });
    showStep(2, 'done');
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    console.error(`[direct-generate:1/2 plan] 실패 ${elapsed}ms`, err);
    toast(`바로 제작 실패 (1단계 — 기획): ${err.message}`, 'error', 8000);
    showErrorBox('⚡ 바로 제작 실패 (1단계 — 기획·이미지 매칭)', err.message, elapsed);
    markDownloadState('failed');
    setLoading(false);
    return;
  }

  // ── 2/2: generate (plan 전달) ──────────────────────────────
  try {
    setLoading(true, '⚡ 2/2 — 상세페이지 HTML 생성 중... (보통 30초~3분)');
    const productImgs = state.productImages.map((i) => ({ name: i.name, data: i.dataUrl, slug: null, kind: 'product', description: i.description || '' }));
    const referenceImgs = state.referenceImages.map((i) => ({ name: i.name, data: i.dataUrl, slug: null, kind: 'reference', description: i.description || '' }));
    const genPayload = {
      style_key: styleKey,
      content_style_key: contentStyleKey,
      reference_key: referenceKey,
      text,
      plan,
      images: [...productImgs, ...referenceImgs],
    };
    console.log('[direct-generate:2/2 generate] 요청 시작');
    const r = await api('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genPayload),
      timeoutMs: 30000, // job_id만 받음
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok) {
      throw new Error((initial.error || `status ${r.status}`) + (initial.detail ? ` (${initial.detail})` : ''));
    }
    let data;
    if (initial.job_id) {
      registerActiveJob(initial.job_id);
      try {
        data = await pollJob(initial.job_id, {
          onProgress: (job) => setLoading(true, `⚡ 2/2 — 상세페이지 HTML 생성 중... (${Math.round((job.elapsed_ms || 0)/1000)}초)`),
        });
      } finally { unregisterActiveJob(initial.job_id); }
    } else {
      data = initial;
    }
    const elapsedTotal = Math.round(performance.now() - t0);
    console.log(`[direct-generate:2/2 generate] 완료 ${elapsedTotal}ms`, { saved_name: data.saved_name, output_len: data.output?.length });
    showStep(4, 'done');
    showGenerateResult(data.output, data.saved_name, data.saved_url);
    markDownloadState('success');
    const totalSec = (elapsedTotal / 1000).toFixed(1);
    if (data.saved_name) {
      toast(`⚡ 바로 제작 완료 (${totalSec}초) — output/${data.saved_name} 저장됨`, 'success', 5000);
    } else {
      toast(`⚡ 바로 제작 완료 (${totalSec}초, 자동 저장 실패 — 다운로드로 받으세요)`, 'success', 5000);
    }
    document.querySelector('#download-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    console.error(`[direct-generate:2/2 generate] 실패 ${elapsed}ms`, err);
    toast(`바로 제작 실패 (2단계 — HTML): ${err.message}`, 'error', 8000);
    showErrorBox('⚡ 바로 제작 실패 (2단계 — HTML 생성)', err.message, elapsed);
    markDownloadState('failed');
  } finally {
    setLoading(false);
  }
}

// ────────── 다운로드 영역 상태 표시 ──────────
// Codex 진단 10번: 버튼 활성화가 showGenerateResult 단일 경로에만 의존 — 실패 시 명시 상태 없음
// state: 'idle' | 'pending' | 'success' | 'failed'
function markDownloadState(stateKey, message) {
  const section = document.querySelector('#download-section');
  const label = document.querySelector('#download-state-label');
  const dlHtml = document.querySelector('#btn-download-html');
  const dlJpeg = document.querySelector('#btn-download-jpeg');
  const hint = document.querySelector('#download-hint');
  if (!section) return;
  section.dataset.state = stateKey;
  const defaults = {
    idle:    '생성 완료 후 자동 활성화',
    pending: '⏳ 생성 중 — 응답 대기 (보통 1~5분)',
    success: '✓ 생성 완료 — 다운로드 가능',
    failed:  '⚠ 생성 실패 — 다시 시도하세요',
  };
  if (label) label.textContent = message || defaults[stateKey] || defaults.idle;
  // 버튼 활성/비활성
  const enable = stateKey === 'success';
  if (dlHtml) { dlHtml.disabled = !enable; }
  if (dlJpeg) { dlJpeg.disabled = !enable; }
  // 안내 텍스트
  if (hint) {
    if (stateKey === 'success') hint.hidden = true;
    else hint.hidden = false;
    if (stateKey === 'failed') hint.textContent = '에러 박스의 메시지를 확인 후 다시 시도하시거나, 첨부 이미지/카피를 줄여 보세요.';
    else if (stateKey === 'pending') hint.textContent = '서버가 claude CLI 응답을 기다리는 중입니다. 페이지를 닫지 마세요.';
    else if (stateKey === 'idle') hint.textContent = '① 기획 → ② 상세페이지 HTML 생성 순서대로 진행해 주세요. 완료되면 두 버튼이 활성화됩니다.';
  }
}

// ────────── 에러 박스 (영구 표시 — 토스트 사라져도 보임) ──────────
function showErrorBox(title, message, elapsedMs) {
  let box = document.querySelector('#error-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'error-box';
    box.className = 'error-box';
    const dl = document.querySelector('#download-section');
    if (dl) dl.parentNode.insertBefore(box, dl);
  }
  const elapsedStr = elapsedMs ? ` · ${(elapsedMs/1000).toFixed(1)}초 소요` : '';
  // 서버 정보 자동 진단 (Codex 5-1: 동적 버전 기반)
  let serverDiag = '';
  if (serverInfoCache) {
    const sv = serverInfoCache.version;
    const bootStr = serverInfoCache.boot_time ? new Date(serverInfoCache.boot_time).toLocaleString('ko-KR') : '?';
    const cfgT = serverInfoCache.claude_timeout_ms;
    const bootChanged = serverInfoBaseline && serverInfoBaseline.boot_time !== serverInfoCache.boot_time;
    if (bootChanged) {
      serverDiag = `
      <div class="error-box__stale">
        🔄 <b>서버가 재부팅됐습니다.</b> 페이지를 Ctrl+F5로 새로고침하세요.<br>
        · 페이지 로드 시점 버전: <code>${escapeHTML(serverInfoBaseline.version || '?')}</code><br>
        · 현재 서버 버전: <code>${escapeHTML(sv || '?')}</code><br>
        · 새 서버 부팅 시각: ${escapeHTML(bootStr)}
      </div>`;
    } else if (!sv) {
      serverDiag = `
      <div class="error-box__stale">
        🚨 <b>서버 버전 정보 없음</b> — 옛 코드일 수 있습니다.<br>
        <b>해결</b>: <code>서버 재시작.bat</code> 더블클릭 후 Ctrl+F5
      </div>`;
    } else {
      serverDiag = `<div class="error-box__server">서버 ${escapeHTML(sv)} · 부팅 ${escapeHTML(bootStr)} · claude_timeout ${cfgT ? Math.round(cfgT/1000)+'초' : '?'}</div>`;
    }
  }
  box.innerHTML = `
    <div class="error-box__head">
      <span class="error-box__icon">⚠️</span>
      <span class="error-box__title">${escapeHTML(title)}</span>
      <button class="error-box__close" type="button" title="닫기">✕</button>
    </div>
    <div class="error-box__body">${escapeHTML(message)}${elapsedStr}</div>
    ${serverDiag}
    <div class="error-box__hint">
      · 서버 콘솔(코드 실행한 터미널)에 자세한 로그가 있습니다 (claude 응답 길이·timeout 여부 등).<br>
      · 브라우저 콘솔(F12)에서 <code>[direct-generate]</code> 로그를 확인하세요.<br>
      · 자주 발생하면 첨부 이미지 수를 줄이거나 카피를 더 짧게 시도해 보세요.
    </div>
  `;
  box.querySelector('.error-box__close').addEventListener('click', () => box.remove());
}
function clearErrorBox() {
  document.querySelector('#error-box')?.remove();
}

// ────────── Step 4: 최종 HTML 생성 ──────────
async function callGenerate() {
  if (!state.plan) {
    toast('먼저 ① 기획 생성을 진행하세요', 'error');
    return;
  }
  const text = $('#content-text').value.trim();
  const styleKey = $('#style-select').value;
  const contentStyleKey = $('#content-style-select').value;
  const referenceKey = $('#reference-select')?.value || 'none';
  if (!text || !styleKey) {
    toast('Step 1 입력이 비어있습니다', 'error');
    return;
  }
  clearErrorBox();
  markDownloadState('pending');
  setLoading(true, '② 최종 HTML 생성 중... (보통 1~5분)');
  const t0 = performance.now();
  try {
    const slotImgs = Object.entries(state.slotImages).map(([slug, info]) => ({
      name: info.name, data: info.dataUrl, slug,
    }));
    // Step 1 첨부 이미지: 제품은 kind='product', 기타는 kind='reference' 로 라벨링
    const productImgs = state.productImages.map((i) => ({ name: i.name, data: i.dataUrl, slug: null, kind: 'product', description: i.description || '' }));
    const referenceImgs = state.referenceImages.map((i) => ({ name: i.name, data: i.dataUrl, slug: null, kind: 'reference', description: i.description || '' }));
    const payload = {
      style_key: styleKey,
      content_style_key: contentStyleKey,
      reference_key: referenceKey,
      text,
      plan: state.plan,
      images: [...slotImgs, ...productImgs, ...referenceImgs],
    };
    console.log('[generate:plan] 요청 시작', { 첨부수: payload.images.length, 카피길이: text.length, style: styleKey });
    const r = await api('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 30000, // job_id만 받음
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok) {
      throw new Error((initial.error || `status ${r.status}`) + (initial.detail ? ` (${initial.detail})` : ''));
    }
    let data;
    if (initial.job_id) {
      registerActiveJob(initial.job_id);
      try {
        data = await pollJob(initial.job_id, {
          onProgress: (job) => setLoading(true, `② 최종 HTML 생성 중... (${Math.round((job.elapsed_ms || 0)/1000)}초)`),
        });
      } finally { unregisterActiveJob(initial.job_id); }
    } else {
      data = initial;
    }
    const elapsed = Math.round(performance.now() - t0);
    console.log(`[generate:plan] 완료 ${elapsed}ms`, { saved_name: data.saved_name, output_len: data.output?.length });
    if (false) {  // 호환성 분기 끝 — data는 위에서 결정됨
    }
    showGenerateResult(data.output, data.saved_name, data.saved_url);
    markDownloadState('success');
    if (data.saved_name) {
      toast(`상세페이지 생성 완료 (${(elapsed/1000).toFixed(1)}초) — output/${data.saved_name} 저장됨`, 'success', 5000);
    } else {
      toast('상세페이지 생성 완료 (자동 저장 실패 — 다운로드로 받으세요)', 'success', 5000);
    }
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    console.error(`[generate:plan] 실패 ${elapsed}ms`, err);
    toast(`생성 실패: ${err.message}`, 'error', 8000);
    showErrorBox('② 상세페이지 생성 실패', err.message, elapsed);
    markDownloadState('failed');
  } finally {
    setLoading(false);
  }
}

// ────────── 결과: JPEG 다운로드 (백엔드 호출) ──────────
async function downloadJPEG() {
  if (!state.lastGeneratedHTML) { toast('생성된 HTML이 없습니다', 'error'); return; }
  setLoading(true, 'JPEG 변환 요청 중...');
  try {
    // 1) job 생성 — 즉시 job_id 받기
    const r = await api('/api/render-jpeg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: state.lastGeneratedHTML }),
      timeoutMs: 30000,
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok) {
      throw new Error((initial.error || `status ${r.status}`) + (initial.detail ? ` (${initial.detail})` : ''));
    }
    // 2) job polling 또는 구버전 fallback (구버전이면 즉시 zip blob 반환)
    let downloadUrl;
    if (initial.job_id) {
      registerActiveJob(initial.job_id);
      const result = await pollJob(initial.job_id, {
        onProgress: (job) => setLoading(true, `JPEG 분할 중... (${Math.round((job.elapsed_ms || 0)/1000)}초)`),
      });
      unregisterActiveJob(initial.job_id);
      downloadUrl = result.download_url;
    }
    // 3) zip 다운로드
    if (downloadUrl) {
      const dl = await api(downloadUrl, { timeoutMs: 60000 });
      if (!dl.ok) throw new Error(`zip 다운로드 실패 (status ${dl.status})`);
      const blob = await dl.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kozon_detail_jpeg_${Date.now()}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('JPEG zip 다운로드 시작', 'success');
    } else {
      throw new Error('서버가 download_url을 반환하지 않음');
    }
  } catch (err) {
    toast(`JPEG 변환 실패: ${err.message}`, 'error', 6000);
  } finally {
    setLoading(false);
  }
}

function showGenerateResult(output, savedName, savedUrl) {
  state.lastGeneratedHTML = extractHTML(output);
  $('#generate-result').hidden = false;
  $('#result-code').textContent = output;
  $('#result-preview').srcdoc = state.lastGeneratedHTML || '';
  setViewMode('code');

  // 다운로드 버튼 활성화
  const dlHtml = $('#btn-download-html');
  const dlJpeg = $('#btn-download-jpeg');
  if (dlHtml) { dlHtml.disabled = false; dlHtml.removeAttribute('title'); }
  if (dlJpeg) { dlJpeg.disabled = false; dlJpeg.removeAttribute('title'); }
  const hint = $('#download-hint');
  if (hint) hint.hidden = true;

  // 자동 저장 결과 표시 + 새 창 열기 링크
  const info = $('#saved-path-info');
  const openLink = $('#btn-open-saved');
  if (savedName) {
    if (info) info.textContent = ` · 도메인 자동 저장: output/${savedName}`;
    if (openLink) {
      openLink.href = savedUrl || `/output/${encodeURIComponent(savedName)}`;
      openLink.hidden = false;
    }
  } else {
    if (info) info.textContent = ' · 자동 저장 실패 (다운로드로 받으세요)';
    if (openLink) openLink.hidden = true;
  }
}

function extractHTML(text) {
  // ```html ... ``` 또는 ``` ... ``` 안의 HTML 추출
  const m1 = /```(?:html)?\s*([\s\S]*?)```/i.exec(text);
  if (m1) return m1[1].trim();
  // 코드블록 없으면 그냥 본문이 HTML이라고 가정
  if (/<html[\s>]/i.test(text) || /<!DOCTYPE/i.test(text)) return text;
  return text;
}

function setViewMode(mode) {
  state.viewMode = mode;
  const code = $('#result-code');
  const preview = $('#result-preview');
  if (mode === 'preview') {
    code.hidden = true;
    preview.hidden = false;
  } else {
    code.hidden = false;
    preview.hidden = true;
  }
}

// ────────── 추출 API 호출 ──────────
async function callExtract() {
  const text = $('#extract-input').value.trim();
  if (!text) {
    toast('자연어 설명을 입력해 주세요', 'error');
    return;
  }
  setLoading(true, '내용 추출 중...');
  try {
    const r = await api('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
      timeoutMs: 30000, // job_id만 받음
    });
    const initial = await safeJSON(r);
    if (!r.ok || !initial.ok) {
      throw new Error((initial.error || `status ${r.status}`) + (initial.detail ? ` (${initial.detail})` : ''));
    }
    let data;
    if (initial.job_id) {
      registerActiveJob(initial.job_id);
      data = await pollJob(initial.job_id, {
        onProgress: (job) => setLoading(true, `내용 추출 중... (${Math.round((job.elapsed_ms || 0)/1000)}초)`),
      });
      unregisterActiveJob(initial.job_id);
    } else {
      data = initial;
    }
    $('#extract-result').hidden = false;
    $('#extract-output').textContent = data.output;
    toast('내용 추출 완료', 'success');
  } catch (err) {
    toast(`추출 실패: ${err.message}`, 'error', 6000);
  } finally {
    setLoading(false);
  }
}

// ────────── 이미지 프롬프트 생성 (룰베이스, 즉시) ──────────
// 사장님이 ChatGPT(Plus) 이미지 생성에 그대로 붙여넣을 영문 프롬프트를 만든다.
// 컷 × 디자인톤 × 플랫폼 매트릭스 기반 — 서버 호출 없음, 클릭 즉시.

const SHOT_PRESETS = {
  main: {
    ko: '메인 비주얼', aspect: '1:1 square', framing: 'hero shot, medium product shot',
    composition: 'product centered, eye-level angle, generous negative space around the subject',
  },
  detail: {
    ko: '디테일 클로즈업', aspect: '1:1 square', framing: 'macro close-up',
    composition: 'extreme close-up showing surface texture, material finish and fine details, shallow depth of field',
  },
  scene: {
    ko: '사용 시나리오', aspect: '3:2 landscape', framing: 'lifestyle environmental shot',
    composition: 'product naturally placed in a real-life context, hand or environment hints, soft storytelling',
  },
  infographic: {
    ko: '인포그래픽', aspect: '4:5 portrait', framing: 'flat product layout',
    composition: 'product centered on a clean flat backdrop with generous empty space at top and bottom for Korean text overlays to be added later',
  },
  comparison: {
    ko: '비교 컷', aspect: '2:1 wide', framing: 'split-screen side-by-side',
    composition: 'two halves left and right showing the same product in two states or contexts (before / after, dim / bright, etc.), clearly divided',
  },
  banner: {
    ko: 'CTA 배너', aspect: '16:9 landscape', framing: 'cinematic wide banner',
    composition: 'product offset to the right (or left) with a large empty area on the opposite side reserved for a Korean headline to be added later',
  },
};

const STYLE_PRESETS = {
  premium: {
    ko: '프리미엄',
    lighting: 'dramatic chiaroscuro studio lighting from upper-left, deep controlled shadows on the opposite side',
    palette: 'deep navy, charcoal, matte black, with warm metallic gold or copper accents',
    background: 'dark gradient backdrop, very subtle bokeh, no busy textures',
    mood: 'luxurious, refined, editorial, high-end commercial',
  },
  casual: {
    ko: '캐주얼',
    lighting: 'bright airy daylight, soft natural sunlight, gentle shadows',
    palette: 'vibrant pastels with one bold accent color, warm cheerful tones',
    background: 'simple colorful seamless backdrop or soft outdoor blur, friendly props',
    mood: 'cheerful, energetic, approachable, lifestyle-friendly',
  },
  minimal: {
    ko: '미니멀',
    lighting: 'even soft diffused light, minimal shadows',
    palette: 'mostly white or very light gray with a single subtle accent color',
    background: 'pure white or neutral seamless backdrop, abundant negative space',
    mood: 'clean, calm, restrained, gallery-quality',
  },
  modern: {
    ko: '모던',
    lighting: 'high-contrast directional lighting with a colored gel accent (cyan or magenta highlight)',
    palette: 'contemporary gradient hues, neon highlights, futuristic tones',
    background: 'bold gradient or geometric backdrop, asymmetric composition',
    mood: 'bold, contemporary, asymmetric, fashion-forward',
  },
};

// 플랫폼별 권장 사이즈 — 컷 종류와 비율을 맞춘 픽셀 값
const PLATFORM_SIZES = {
  naver: {
    ko: '네이버 스마트스토어', maxHint: 'fit within 860px wide (Naver Smart Store)',
    sizes: { main: '860x860', detail: '860x860', scene: '860x573', infographic: '860x1075', comparison: '860x430', banner: '860x483' },
  },
  coupang: {
    ko: '쿠팡', maxHint: 'fit within 780px wide (Coupang)',
    sizes: { main: '780x780', detail: '780x780', scene: '780x520', infographic: '780x975', comparison: '780x390', banner: '780x439' },
  },
  instagram: {
    ko: '인스타그램', maxHint: 'Instagram feed-compatible',
    sizes: { main: '1080x1080', detail: '1080x1080', scene: '1080x720', infographic: '1080x1350', comparison: '1080x540', banner: '1080x608' },
  },
  own: {
    ko: '자사몰 / 자유', maxHint: 'flexible (high-res preferred)',
    sizes: { main: '1024x1024', detail: '1024x1024', scene: '1536x1024', infographic: '1024x1280', comparison: '2048x1024', banner: '1792x1008' },
  },
};

function buildImagePrompt({ product, shot, style, platform, extra, reference }) {
  const s = SHOT_PRESETS[shot];
  const baseStyle = STYLE_PRESETS[style];
  const pl = PLATFORM_SIZES[platform];
  const target = pl.sizes[shot];
  const subject = (product || '').trim() || 'the product';
  const extraLine = (extra || '').trim();

  // 레퍼런스 오버라이드 적용 — image_prompt_overrides 가 있으면 lighting/palette/background/mood 갈아끼움
  const refOv = (reference && reference.image_prompt_overrides) || {};
  const st = {
    ko: reference ? `${baseStyle.ko} × ${reference.label}` : baseStyle.ko,
    lighting: refOv.lighting || baseStyle.lighting,
    palette: refOv.palette || baseStyle.palette,
    background: refOv.background || baseStyle.background,
    mood: refOv.mood || baseStyle.mood,
  };

  const refLine = reference
    ? `Reference style: emulate the visual signature of "${reference.label}" — ${(reference.tone || []).join(', ')}.`
    : '';

  const en = [
    `Professional product photography of ${subject}, ${s.framing}.`,
    `Composition: ${s.composition}. Aspect ratio: ${s.aspect}.`,
    `Lighting: ${st.lighting}.`,
    `Color palette: ${st.palette}.`,
    `Background: ${st.background}.`,
    `Mood: ${st.mood}.`,
    refLine,
    `Quality: photorealistic, ultra-sharp focus, 8k commercial photography, no artifacts, no compression.`,
    extraLine ? `Additional direction: ${extraLine}.` : '',
    `Negative: no text overlay, no watermarks, no logos other than the product itself, no busy clutter, no unintended people in frame.`,
    `Output: ${s.aspect} aspect ratio, target output size approximately ${target} px (${pl.maxHint}).`,
  ].filter(Boolean).join('\n');

  const kr = [
    `[ ${s.ko} · ${st.ko} · ${pl.ko} ]`,
    `비율: ${s.aspect}`,
    `권장 출력 사이즈: ${target} px`,
    `참고: ${pl.maxHint}`,
    reference ? `레퍼런스 적용: ${reference.label} (${(reference.tone || []).join('·')})` : '',
    extraLine ? `추가 디렉션: ${extraLine}` : '',
    '',
    '── ChatGPT(Plus) 사용 순서 ──',
    '1) chat.openai.com 열기 → 새 채팅 → 이미지 생성 모드 (그림 아이콘 또는 "이미지 만들어줘")',
    '2) 위 영문 프롬프트를 그대로 복사해 붙여넣기',
    '3) 생성된 이미지 다운로드',
    '4) 상세페이지 제작기 좌측 이미지 드롭존에 끌어다 놓기 (또는 Ctrl+V)',
    '',
    '── 보정 팁 ──',
    `· 사이즈 안 맞으면 ChatGPT에 "사이즈를 ${target}으로 다시 만들어줘" 추가 요청`,
    '· 같은 톤으로 여러 컷 필요하면 같은 채팅에서 "같은 스타일로 다른 각도" 요청',
    '· 상품 사진을 첨부했다면 "이 이미지의 제품을 사용해서 위 프롬프트대로" 라고 명시',
  ].filter(v => v).join('\n');

  return { en, kr };
}

let lastImagePrompt = null;

function callImagePrompt() {
  const product = $('#ip-product').value;
  const shot = $('#ip-shot').value;
  const style = $('#ip-style').value;
  const platform = $('#ip-platform').value;
  const extra = $('#ip-extra').value;
  const refKey = $('#ip-reference')?.value || 'none';
  const reference = (refKey !== 'none') ? (state.references.find((r) => r.key === refKey) || null) : null;

  if (!product.trim()) {
    toast('상품 / 핵심 설명을 한 줄 적어주세요 (영문 권장)', 'error');
    $('#ip-product').focus();
    return;
  }

  lastImagePrompt = buildImagePrompt({ product, shot, style, platform, extra, reference });

  $('#imageprompt-result').hidden = false;
  $('#imageprompt-output').textContent =
    '── 영문 프롬프트 (ChatGPT 붙여넣기용) ──\n' +
    lastImagePrompt.en +
    '\n\n── 한글 메모 ──\n' +
    lastImagePrompt.kr;

  toast('프롬프트 생성 완료. "영문 프롬프트 복사" 후 ChatGPT에 붙여넣으세요.', 'success', 2500);
}

// ────────── 복사 / 다운로드 / 보내기 ──────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('클립보드에 복사됨', 'success', 1500);
  } catch (err) {
    // fallback: 텍스트 영역 사용
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('클립보드에 복사됨', 'success', 1500);
    } catch (e) {
      toast(`복사 실패: ${e.message}`, 'error');
    }
    document.body.removeChild(ta);
  }
}

function downloadHTML() {
  if (!state.lastGeneratedHTML) {
    toast('생성된 HTML이 없습니다', 'error');
    return;
  }
  const blob = new Blob([state.lastGeneratedHTML], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kozon_detail_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ────────── 이벤트 바인딩 ──────────
// 모든 셀렉터를 옵셔널 체이닝(?.)으로 — 옛 캐시 HTML 등 마크업 누락 시 throw 없이 skip.
// 한 셀렉터가 null이라고 bindEvents 전체가 중단되어 loadStyles까지 못 가는 사고 차단.
function bindEvents() {
  $('#btn-plan')?.addEventListener('click', withInflight('plan', '#btn-plan', callPlan));
  $('#btn-direct-generate')?.addEventListener('click', withInflight('direct', '#btn-direct-generate', callDirectGenerate));
  $('#btn-generate')?.addEventListener('click', withInflight('generate', '#btn-generate', callGenerate));
  $('#btn-extract')?.addEventListener('click', withInflight('extract', '#btn-extract', callExtract));
  $('#style-select')?.addEventListener('change', updateStyleDesc);
  $('#content-style-select')?.addEventListener('change', updateContentStyleDesc);
  $('#reference-select')?.addEventListener('change', updateReferenceDesc);
  $('#btn-copy-all-prompts')?.addEventListener('click', copyAllPrompts);
  $('#btn-download-prompts')?.addEventListener('click', downloadPromptsTxt);
  $('#btn-download-jpeg')?.addEventListener('click', withInflight('jpeg', '#btn-download-jpeg', downloadJPEG));

  // v0.7 — Higgsfield 일괄 생성 + 일괄 승인 토글
  $('#btn-higgsfield-generate')?.addEventListener('click', withInflight('higgsfield', '#btn-higgsfield-generate', callHiggsfieldGenerate));
  $('#btn-approve-all')?.addEventListener('click', () => approveAllSlots(true));
  $('#btn-reject-all')?.addEventListener('click', () => approveAllSlots(false));

  $('#btn-copy-html')?.addEventListener('click', () => {
    if (!state.lastGeneratedHTML) {
      toast('생성된 HTML이 없습니다', 'error');
      return;
    }
    copyToClipboard(state.lastGeneratedHTML);
  });
  $('#btn-download-html')?.addEventListener('click', downloadHTML);
  $('#btn-toggle-view')?.addEventListener('click', () => {
    setViewMode(state.viewMode === 'code' ? 'preview' : 'code');
  });

  $('#btn-copy-extract')?.addEventListener('click', () => {
    const text = $('#extract-output')?.textContent || '';
    if (!text.trim()) {
      toast('추출 결과가 없습니다', 'error');
      return;
    }
    copyToClipboard(text);
  });
  $('#btn-imageprompt')?.addEventListener('click', callImagePrompt);
  $('#btn-copy-imageprompt')?.addEventListener('click', () => {
    if (!lastImagePrompt) { toast('먼저 프롬프트를 생성해 주세요', 'error'); return; }
    copyToClipboard(lastImagePrompt.en);
  });
  $('#btn-copy-imageprompt-kr')?.addEventListener('click', () => {
    if (!lastImagePrompt) { toast('먼저 프롬프트를 생성해 주세요', 'error'); return; }
    copyToClipboard(lastImagePrompt.kr);
  });

  $('#btn-send-to-maker')?.addEventListener('click', () => {
    const text = $('#extract-output')?.textContent || '';
    if (!text.trim()) {
      toast('추출 결과가 없습니다', 'error');
      return;
    }
    const ta = $('#content-text');
    if (!ta) return;
    ta.value = (ta.value ? ta.value + '\n\n' : '') + text;
    ta.focus();
    toast('좌측 내용란에 추가됨', 'success', 1500);
  });
}

// ────────── 초기화 ──────────
// 각 setup 함수를 독립 try/catch로 격리 — 한 함수 throw해도 loadStyles까지 항상 도달 보장.
// codex 진단: init() 내 setup 호출이 try/catch 없이 순차 실행되면 한 곳 fail이 전체 fail로 번짐.
async function init() {
  const safeRun = (label, fn) => {
    try { fn(); } catch (e) { console.error(`[init] ${label} 실패:`, e); }
  };
  safeRun('setupDropzone(product)', () => setupDropzone('product'));
  safeRun('setupDropzone(reference)', () => setupDropzone('reference'));
  safeRun('setupPaste', setupPaste);
  safeRun('bindEvents', bindEvents);
  safeRun('setupInpaintModal', setupInpaintModal);
  // 「지금 다시 확인」 버튼
  safeRun('server-offline-retry', () => {
    $('#server-offline-retry')?.addEventListener('click', () => { pingServer(); });
  });

  // pingServer + loadStyles + loadReferences는 위 setup* 결과와 무관하게 항상 실행
  try { await pingServer(); } catch (e) { console.error('[init] pingServer 실패:', e); }
  // 서버 ON일 때만 styles/refs 로드 시도 (OFF면 placeholder가 이미 표시됨)
  if (__isServerOnline) {
    await Promise.all([
      loadStyles().catch((e) => console.error('[init] loadStyles 실패:', e)),
      loadReferences().catch((e) => console.error('[init] loadReferences 실패:', e)),
    ]);
  } else {
    try { setSelectsToOfflineState(); } catch (e) { console.error('[init] setSelectsToOfflineState 실패:', e); }
  }
  setInterval(pingServer, 8000);  // 30초→8초: 서버 OFF→ON 빠른 감지
}

// v0.7.9 — 동적 script 로드 호환 패턴.
// index.html이 캐시 무효화를 위해 <script>를 createElement + appendChild로 추가하므로,
// DOMContentLoaded 이벤트가 이미 발생한 후에 app.js가 실행될 수 있다. 그 경우 addEventListener는
// 이미 지나간 이벤트에 등록되어 init()이 절대 호출 안 됨 → setupDropzone/loadStyles 모두 미실행
// → drag-drop 안 됨 + select 옵션 안 뜸 (사장님 신고와 정확히 일치하는 시나리오).
// 해결: readyState로 분기하여 이미 로드 완료 상태면 즉시 init() 호출.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM 이미 준비됨 — 즉시 호출 (microtask로 한 단계 미뤄 다른 inline script 끝나길 보장)
  Promise.resolve().then(init);
}
