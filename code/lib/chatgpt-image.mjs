/**
 * chatgpt-image.mjs
 * Automates ChatGPT web UI to generate images using the user own ChatGPT Plus session.
 * Playwright persistent context: login once, profile reused every time.
 *
 * export: generateImage({ prompt, count = 1 }) => Promise<{ ok, files, elapsed_ms }>
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const CODE_ROOT   = join(__dirname, '..');
const DOMAIN_ROOT = join(CODE_ROOT, '..');
const GENERATED_DIR = join(CODE_ROOT, 'generated');
const PROFILE_DIR   = join(DOMAIN_ROOT, 'chatgpt-profile');

const LOGIN_TIMEOUT_MS      = 5 * 60 * 1000;
const GENERATION_TIMEOUT_MS = 150 * 1000;
const POLL_INTERVAL_MS      = 3000;
const CHATGPT_CHAT_URL = 'https://chatgpt.com/';

// Input box selector candidates (tried in order; first visible one wins)
const INPUT_SELECTORS = [
  '#prompt-textarea',
  'textarea[placeholder]',
  '[contenteditable="true"][data-testid]',
  '[contenteditable="true"].ProseMirror',
  '[contenteditable="true"]',
];

// Image selector candidates in the ChatGPT assistant response area
// 2026-06-12 확정: ChatGPT 최신 응답은 chatgpt.com/backend-api/estuary/content?... 도메인 사용
const IMG_SELECTORS = [
  'img[src*="chatgpt.com/backend-api/estuary"]',
  'img[alt^="생성된 이미지"]',
  'img[alt^="Generated image"]',
  'img[src*="chatgpt.com/backend-api"]',
  'img[src*="oaiusercontent.com"]',
  'img[src*="files.oaiusercontent"]',
  'img[src*="cdn.openai"]',
  'div[data-message-author-role="assistant"] img[src^="https"]',
  '.markdown img[src^="https"]',
];

async function isLoggedIn(page) {
  const url = page.url();
  // 명백한 로그인/인증 페이지면 false
  if (url.includes('/auth/login') || url.includes('/auth/') ||
      url.includes('login.openai') || url.includes('accounts.openai') ||
      url.includes('auth0.openai')) return false;
  // chatgpt.com 메인 URL이면 일단 로그인 상태 후보
  if (!url.startsWith('https://chatgpt.com/') && !url.startsWith('https://chat.openai.com/')) {
    return false;
  }
  // 로그인 버튼이 화면에 보이면 미로그인
  try {
    const loginBtnSels = [
      'button[data-testid="login-button"]',
      'a[href*="/auth/login"]',
      'button:has-text("Log in")',
      'button:has-text("로그인")',
    ];
    for (const sel of loginBtnSels) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) return false;
      } catch (_) {}
    }
  } catch (_) {}
  // URL이 chatgpt.com 메인이고 로그인 버튼 안 보이면 로그인된 것으로 간주
  return true;
}

async function waitForLogin(page) {
  console.log('[chatgpt-image] Not logged in. Please log in to ChatGPT in the browser window that opened.');
  console.log('[chatgpt-image] Waiting up to 5 minutes for login...');
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) {
      console.log('[chatgpt-image] Login detected. Continuing...');
      return;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Login timeout: user did not log in within 5 minutes');
}

async function findInputBox(page) {
  for (const sel of INPUT_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return el;
    } catch (_) {}
  }
  // P2a: 모든 셀렉터 실패 시 진단 정보 덤프
  console.warn('[findInputBox] All selectors failed. Diagnostic dump:');
  for (const sel of INPUT_SELECTORS) {
    try {
      const el = await page.$(sel);
      const visible = el ? await el.isVisible().catch(() => 'error') : 'not found';
      console.warn(`  selector=${sel} -> ${visible}`);
    } catch (e) {
      console.warn(`  selector=${sel} -> exception: ${e.message}`);
    }
  }
  return null;
}

async function dumpDiagnostic(page, tag) {
  try {
    if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true });
    const ts = Date.now();
    const shot = join(GENERATED_DIR, '_diag_' + tag + '_' + ts + '.png');
    const html = join(GENERATED_DIR, '_diag_' + tag + '_' + ts + '.html');
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const content = await page.content().catch(() => '');
    writeFileSync(html, content);
    console.log('[chatgpt-image] Diagnostic saved: ' + shot);
    console.log('[chatgpt-image] Diagnostic saved: ' + html);
  } catch (e) {
    console.warn('[chatgpt-image] Diagnostic dump failed: ' + e.message);
  }
}

async function waitForImages(page, count) {
  console.log('[chatgpt-image] Waiting for image generation (max ' + Math.round(GENERATION_TIMEOUT_MS/1000) + 's)...');
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const sel of IMG_SELECTORS) {
      try {
        const imgs = await page.$$(sel);
        if (imgs.length >= count) {
          const srcs = (await Promise.all(imgs.slice(0, count).map(i => i.getAttribute('src'))))
                       .filter(s => s && s.startsWith('http'));
          if (srcs.length >= count) {
            console.log('[chatgpt-image] Found ' + srcs.length + ' image(s).');
            return srcs;
          }
        }
      } catch (_) {}
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  await dumpDiagnostic(page, 'timeout');
  throw new Error('Generation timeout: no image appeared in ' + Math.round(GENERATION_TIMEOUT_MS/1000) + 's. Diagnostic screenshot+HTML saved to code/generated/_diag_*. Update IMG_SELECTORS based on what you see.');
}

function downloadUrl(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = createWriteStream(dest);
    proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Referer':    'https://chatgpt.com/',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(() => downloadUrl(res.headers.location, dest).then(resolve).catch(reject));
        return;
      }
      if (res.statusCode !== 200) {
        file.close(() => reject(new Error('HTTP ' + res.statusCode + ' downloading image')));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => file.close(() => reject(err)));
  });
}

async function launchContext() {
  const opts = {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-position=100,80',
      '--window-size=1280,900',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  console.log('[chatgpt-image] Launching bundled Chromium (isolated from your normal Chrome)...');
  return chromium.launchPersistentContext(PROFILE_DIR, opts);
}

/**
 * Generate images via ChatGPT web UI.
 * @param {{ prompt: string, count?: number }} opts
 * @returns {Promise<{ ok: true, files: string[], elapsed_ms: number }>}
 */
export async function generateImage({ prompt, count = 1 }) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim())
    throw new Error('prompt must be a non-empty string');

  const startMs = Date.now();
  if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true });
  if (!existsSync(PROFILE_DIR))   mkdirSync(PROFILE_DIR,   { recursive: true });

  let ctx;
  try {
    ctx = await launchContext();
    const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

    console.log('[chatgpt-image] Navigating to ChatGPT...');
    await page.goto(CHATGPT_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (!(await isLoggedIn(page))) {
      await waitForLogin(page);
      await page.goto(CHATGPT_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await page.waitForTimeout(2000);

    let inputEl = null;
    for (let a = 0; a < 5; a++) {
      inputEl = await findInputBox(page);
      if (inputEl) break;
      console.log('[chatgpt-image] Input box not found, retry ' + (a+1) + '/5...');
      await page.waitForTimeout(2000);
    }
    if (!inputEl)
      throw new Error('Cannot find ChatGPT input box. Update INPUT_SELECTORS in chatgpt-image.mjs.');

    await inputEl.click();
    await page.waitForTimeout(300);
    const tag = await inputEl.evaluate(el => el.tagName.toLowerCase());
    if (tag === 'textarea') {
      await inputEl.fill(prompt);
    } else {
      await inputEl.evaluate((el, t) => {
        el.innerHTML = ''; el.textContent = t;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }, prompt);
    }
    await page.waitForTimeout(400);
    await inputEl.press('Enter');
    console.log('[chatgpt-image] Prompt submitted. Awaiting generation...');

    const srcs = await waitForImages(page, count);
    const ts   = Date.now();
    const files = [];

    // estuary URL은 인증 쿠키 필요 → page.request 우선 (쿠키 자동 포함)
    const seen = new Set();
    for (let i = 0; i < srcs.length; i++) {
      const src = srcs[i];
      if (seen.has(src)) continue;  // 같은 이미지 중복 src 제거
      seen.add(src);
      const dest = join(GENERATED_DIR, ts + '_' + (files.length + 1) + '.png');
      console.log('[chatgpt-image] Downloading image ' + (files.length + 1) + '/' + count + '...');
      try {
        const r = await page.request.get(src);
        if (r.ok()) {
          writeFileSync(dest, await r.body());
          files.push(dest);
          console.log('[chatgpt-image] Saved (page.request): ' + dest);
          if (files.length >= count) break;
        } else {
          throw new Error('HTTP ' + r.status());
        }
      } catch (e1) {
        console.warn('[chatgpt-image] page.request failed: ' + e1.message + '. Trying direct https...');
        try {
          await downloadUrl(src, dest);
          files.push(dest);
          console.log('[chatgpt-image] Saved (https direct): ' + dest);
          if (files.length >= count) break;
        } catch (e2) {
          console.error('[chatgpt-image] Both download methods failed: ' + e2.message);
        }
      }
    }

    if (files.length === 0) throw new Error('Image URLs found but all downloads failed');
    const elapsed_ms = Date.now() - startMs;
    console.log('[chatgpt-image] Done. ' + files.length + ' image(s) in ' + elapsed_ms + 'ms');
    return { ok: true, files, elapsed_ms };

  } finally {
    if (ctx) { try { await ctx.close(); } catch (_) {} }
  }
}

// ======================== Project Parallel Mode ========================
// 사장님의 "프로젝트(조)" 안에서만 N개 탭 병렬 생성 + 지정 폴더 이동

async function enterProject(page, projectName) {
  console.log('[project] Searching sidebar for "' + projectName + '"...');
  // 1차: 정확히 일치하는 truncate div의 클릭 가능한 부모 찾기
  const beforeUrl = page.url();

  // 후보 element 수집 — 정확 매치 우선, 부분 매치 폴백
  // P1b: 사이드바 컨테이너 안에서만 검색하여 다중 매치 방지
  let target = null;
  const sidebarContainer = await page.$('nav, aside, [role="navigation"]').catch(() => null);
  const exactDivs = sidebarContainer
    ? await sidebarContainer.$$('div.truncate').catch(() => [])
    : await page.$$('div.truncate');
  for (const h of exactDivs) {
    try {
      const txt = (await h.textContent() || '').trim();
      if (txt === projectName) {
        if (await h.isVisible()) {
          // 가장 가까운 클릭 가능 ancestor 찾기 (a > button > [role=button] > [data-testid])
          const clickable = await h.evaluateHandle(el => {
            let cur = el;
            for (let i = 0; i < 8 && cur; i++) {
              if (cur.tagName === 'A' || cur.tagName === 'BUTTON' ||
                  cur.getAttribute('role') === 'button' ||
                  cur.getAttribute('data-testid') ||
                  cur.onclick) return cur;
              cur = cur.parentElement;
            }
            return el;
          });
          target = clickable.asElement() || h;
          break;
        }
      }
    } catch (_) {}
  }
  if (!target) {
    // 폴백: 광범위 매치
    const all = await page.$$('div.truncate, a, button, li');
    for (const h of all) {
      try {
        const txt = (await h.textContent() || '').trim();
        if (txt.includes(projectName) && await h.isVisible()) { target = h; break; }
      } catch (_) {}
    }
  }
  if (!target) {
    await dumpDiagnostic(page, 'project_not_found');
    throw new Error('Sidebar item not found: "' + projectName + '". Diagnostic dumped.');
  }

  // 이미 펼쳐진 상태 감지 — 프로젝트(조) 하위 conversation aria-label 가진 anchor가 있어야 진짜 펼침
  async function countProjectAnchors() {
    const all = await page.$$('a[data-sidebar-item="true"]');
    let n = 0;
    for (const a of all) {
      try {
        const label = (await a.getAttribute('aria-label')) || '';
        if (label.includes(projectName)) n++;
      } catch (_) {}
    }
    return n;
  }

  const beforeCount = await countProjectAnchors();
  if (beforeCount > 0) {
    console.log('[project] Sidebar already shows ' + beforeCount + ' "' + projectName + '" anchors — skip click');
  } else {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click();
    await page.waitForTimeout(3500);
    // 펼침 확인 — 안 펼쳐졌으면 한 번 더 클릭 (토글 처리)
    let afterCount = await countProjectAnchors();
    if (afterCount === 0) {
      console.log('[project] First click did not expand — trying once more');
      await target.click().catch(() => {});
      await page.waitForTimeout(3500);
      afterCount = await countProjectAnchors();
    }
    console.log('[project] After click: ' + afterCount + ' project anchors visible');
  }
  const url = page.url();
  console.log('[project] Entered project (SPA, URL may stay): ' + url);
  return url;
}

// ChatGPT 입력 영역의 hidden file input 후보 셀렉터
const FILE_INPUT_SELECTORS = [
  'input[type="file"][accept*="image"]',
  'input[type="file"][multiple]',
  'input[type="file"]',
];

async function attachImageToInput(page, attachPath, tabIdx) {
  if (!attachPath) return false;
  if (!existsSync(attachPath)) {
    console.warn('[tab ' + tabIdx + '] attach path missing: ' + attachPath);
    return false;
  }
  for (const sel of FILE_INPUT_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.setInputFiles(attachPath);
        console.log('[tab ' + tabIdx + '] attached image via ' + sel + ' = ' + attachPath);
        // 미리보기 thumbnail 또는 첨부 상태 표시 대기 (최대 10초)
        // ChatGPT 입력 영역 위에 첨부된 이미지 카드/썸네일이 뜸
        const previewSels = [
          'img[alt*="첨부"]',
          'img[alt*="Attached"]',
          'div[role="img"][aria-label*="첨부"]',
          'div[role="img"][aria-label*="Attached"]',
          '[data-testid*="attachment"]',
          '[data-testid*="attached"]',
        ];
        const previewDeadline = Date.now() + 10000;
        let previewSeen = false;
        while (Date.now() < previewDeadline) {
          for (const ps of previewSels) {
            try {
              const p = await page.$(ps);
              if (p && await p.isVisible()) { previewSeen = true; break; }
            } catch (_) {}
          }
          if (previewSeen) break;
          await page.waitForTimeout(500);
        }
        if (previewSeen) {
          console.log('[tab ' + tabIdx + '] attachment preview confirmed');
        } else {
          console.warn('[tab ' + tabIdx + '] attachment preview not confirmed in 10s — proceeding anyway');
        }
        return true;
      }
    } catch (e) {
      console.warn('[tab ' + tabIdx + '] attach try failed (' + sel + '): ' + e.message);
    }
  }
  // 진단 — 어떤 파일 input도 못 찾음
  console.warn('[tab ' + tabIdx + '] no file input found, sending text-only');
  await dumpDiagnostic(page, 'no_file_input_tab' + tabIdx);
  return false;
}

// 프로젝트 진입(사이드바 펼침) 후, 그 안에 펼쳐진 conversation 항목들의 절대 URL을 N개 수집
// — 새 대화를 만들지 않고 기존 N개 대화를 재활용해 rate-limit 회피
async function findConversationUrls(page, projectName, count) {
  console.log('[conv] Collecting up to ' + count + ' conversation URLs under "' + projectName + '"...');
  // 사이드바 렌더 안정화 — 항목이 count개 이상 잡힐 때까지 폴링 (최대 8초)
  const deadline = Date.now() + 8000;
  let anchors = [];
  let matched = 0;
  while (Date.now() < deadline) {
    anchors = await page.$$('a[data-sidebar-item="true"]');
    // projectName 매치 개수 임시 카운트
    matched = 0;
    for (const a of anchors) {
      try {
        const label = (await a.getAttribute('aria-label')) || '';
        if (label.includes(projectName)) matched++;
      } catch (_) {}
      if (matched >= count) break;
    }
    if (matched >= count) break;
    await page.waitForTimeout(500);
  }

  const urls = [];
  const labels = [];
  for (const a of anchors) {
    try {
      const href  = await a.getAttribute('href');
      const label = (await a.getAttribute('aria-label')) || '';
      // aria-label 예시: "제품 강조 배경 변형, 프로젝트 프로젝트(조)의 채팅"
      if (href && label.includes(projectName)) {
        const abs = href.startsWith('http') ? href : ('https://chatgpt.com' + href);
        urls.push(abs);
        labels.push(label.split(',')[0]);
        if (urls.length >= count) break;
      }
    } catch (_) {}
  }
  console.log('[conv] Found ' + urls.length + '/' + count + ' existing conversations: ' + labels.join(' / '));
  return { urls, labels };
}

// ChatGPT rate-limit / 대화 한도 모달이 떠 있으면 닫음 (정상 다이얼로그는 건드리지 않음 — testid 한정)
async function dismissBlockingModals(page, tabIdx) {
  // 차단성 모달만 testid로 좁혀 식별
  const blockingTestIds = [
    'modal-conversation-history-rate-limit',
    'modal-message-limit',
    'modal-too-many-requests',
    'modal-rate-limit',
  ];
  for (const tid of blockingTestIds) {
    try {
      const m = await page.$('[data-testid="' + tid + '"]');
      if (m && await m.isVisible()) {
        console.warn('[tab ' + tabIdx + '] blocking modal detected (' + tid + '), dismissing...');
        const closers = await m.$$('button[aria-label*="닫기"], button[aria-label*="close"], button[aria-label*="Close"], [data-testid*="close"]');
        if (closers.length > 0) { await closers[0].click().catch(() => {}); }
        else { await page.keyboard.press('Escape').catch(() => {}); }
        await page.waitForTimeout(800);
      }
    } catch (_) {}
  }
  // 폴백: 차단 텍스트("Rate limit", "한도", "초과")가 보이는 dialog만 닫음 (정상 다이얼로그는 보호)
  try {
    const dialogs = await page.$$('[role="dialog"]');
    for (const d of dialogs) {
      if (!(await d.isVisible())) continue;
      const text = (await d.textContent() || '').toLowerCase();
      if (text.includes('rate limit') || text.includes('한도') || text.includes('초과') || text.includes('too many')) {
        console.warn('[tab ' + tabIdx + '] blocking dialog by text match, dismissing...');
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  } catch (_) {}
}

async function submitPromptOnPage(page, item, tabIdx) {
  // item은 string 또는 { prompt, attachPath } 객체
  const prompt = typeof item === 'string' ? item : (item.prompt || '');
  const attachPath = (typeof item === 'object' && item) ? (item.attachPath || null) : null;

  // 0) 모달 차단 처리 (rate-limit 등)
  await dismissBlockingModals(page, tabIdx);

  // 1) 이미지 첨부 먼저 (있을 때만)
  if (attachPath) {
    await attachImageToInput(page, attachPath, tabIdx);
  }

  // 2) 입력박스 찾기 + 텍스트 입력 + Enter
  let inputEl = null;
  for (let a = 0; a < 5; a++) {
    inputEl = await findInputBox(page);
    if (inputEl) break;
    await page.waitForTimeout(1500);
  }
  if (!inputEl) throw new Error('Tab ' + tabIdx + ': input box not found');
  await inputEl.click();
  await page.waitForTimeout(200);
  const tag = await inputEl.evaluate(el => el.tagName.toLowerCase());
  if (tag === 'textarea') {
    await inputEl.fill(prompt);
  } else {
    await inputEl.evaluate((el, t) => {
      el.innerHTML = ''; el.textContent = t;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, prompt);
  }
  await page.waitForTimeout(300);
  await inputEl.press('Enter');
  console.log('[parallel] Tab ' + tabIdx + ' prompt submitted' + (attachPath ? ' (with attached image)' : ''));
}

async function waitAndDownloadOnPage(page, tabIdx, destPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of IMG_SELECTORS) {
      try {
        const imgs = await page.$$(sel);
        for (const im of imgs) {
          const src = await im.getAttribute('src');
          if (src && src.startsWith('http')) {
            // 다운로드 시도
            try {
              const r = await page.request.get(src);
              if (r.ok()) {
                writeFileSync(destPath, await r.body());
                console.log('[parallel] Tab ' + tabIdx + ' saved: ' + destPath);
                return { ok: true, src, dest: destPath };
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  // 타임아웃 — 진단 dump
  await dumpDiagnostic(page, 'parallel_tab' + tabIdx);
  throw new Error('Tab ' + tabIdx + ' timeout — diagnostic dumped');
}

/**
 * Generate N images in parallel inside a ChatGPT Project.
 * @param {{
 *   projectName: string,         // 사이드바에 보이는 텍스트 (예: "프로젝트(조)")
 *   prompts: Array<string | { prompt: string, attachPath?: string }>,  // N개 — 각 슬롯에 첨부 이미지 경로 지정 가능
 *   outputDir?: string,          // 결과 PNG 저장 폴더 (없으면 code/generated/parallel_<ts>/)
 *   staggerMs?: number,          // 탭간 발사 간격 (기본 2500)
 *   perTabTimeoutMs?: number,    // 각 탭 이미지 대기 (기본 180초)
 * }} opts
 * @returns {Promise<{ ok: boolean, files: string[], outputDir: string, projectUrl: string, elapsed_ms: number, failures: any[] }>}
 */
export async function generateImagesInProjectParallel({
  projectName,
  prompts,
  outputDir,
  staggerMs = 2500,
  perTabTimeoutMs = 180000,
}) {
  if (!projectName) throw new Error('projectName is required');
  if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('prompts must be a non-empty array');
  // 정규화 — string 또는 객체 모두 { prompt, attachPath } 형태로
  prompts = prompts.map((p, i) => {
    if (typeof p === 'string') return { prompt: p, attachPath: null };
    if (p && typeof p === 'object') return { prompt: String(p.prompt || ''), attachPath: p.attachPath || null };
    throw new Error('prompt #' + i + ' invalid');
  });

  const startMs = Date.now();
  const N = prompts.length;
  if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true });
  if (!existsSync(PROFILE_DIR))   mkdirSync(PROFILE_DIR,   { recursive: true });
  const finalOutDir = outputDir || join(GENERATED_DIR, 'parallel_' + Date.now());
  if (!existsSync(finalOutDir)) mkdirSync(finalOutDir, { recursive: true });

  let ctx;
  try {
    ctx = await launchContext();
    const firstPage = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();
    await firstPage.goto(CHATGPT_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!(await isLoggedIn(firstPage))) {
      await waitForLogin(firstPage);
      await firstPage.goto(CHATGPT_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await firstPage.waitForTimeout(2000);

    // 1) 첫 페이지 프로젝트 진입 (사이드바 펼침 효과)
    const projectUrl = await enterProject(firstPage, projectName);
    await firstPage.waitForTimeout(1500);

    // 2) 사이드바에서 기존 대화 N개 URL 수집 (새 대화 만들지 않고 재활용 — rate-limit 회피)
    const { urls: convUrls, labels: convLabels } = await findConversationUrls(firstPage, projectName, N);
    if (convUrls.length < N) {
      await dumpDiagnostic(firstPage, 'conv_insufficient');
      throw new Error(
        '프로젝트(조) 안에 미리 만들어둔 대화가 ' + convUrls.length + '개로, 필요한 ' + N + '개보다 부족합니다. ' +
        'ChatGPT에서 사장님이 직접 "프로젝트(조)" 안에 빈 대화를 ' + (N - convUrls.length) + '개 더 만든 뒤 다시 시도해 주세요. ' +
        '진단 자료: code/generated/_diag_conv_insufficient_*.png'
      );
    }

    // 3) 각 탭이 conversation URL로 직접 진입 (새 대화 생성 X)
    const pages = [firstPage];
    // 첫 페이지를 0번 대화로 이동
    await firstPage.goto(convUrls[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
    await firstPage.waitForTimeout(2000);
    await dismissBlockingModals(firstPage, 0);
    console.log('[parallel] Tab 0 entered existing conv: ' + convLabels[0]);

    for (let i = 1; i < N; i++) {
      const p = await ctx.newPage();
      await p.goto(convUrls[i], { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(2000);
      await dismissBlockingModals(p, i);
      pages.push(p);
      console.log('[parallel] Tab ' + i + ' entered existing conv: ' + convLabels[i]);
    }

    // 3) stagger로 프롬프트 발사
    for (let i = 0; i < N; i++) {
      await submitPromptOnPage(pages[i], prompts[i], i);
      if (i < N - 1) await new Promise(r => setTimeout(r, staggerMs));
    }
    console.log('[parallel] All ' + N + ' prompts submitted. Awaiting images...');

    // 4) 동시 결과 대기 + 다운로드
    const ts = Date.now();
    const results = await Promise.allSettled(pages.map((p, i) => {
      const dest = join(finalOutDir, String(i + 1).padStart(2, '0') + '_' + ts + '.png');
      return waitAndDownloadOnPage(p, i, dest, perTabTimeoutMs);
    }));

    const files = [];
    const failures = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value && r.value.ok) files.push(r.value.dest);
      else failures.push({ tab: i, reason: r.reason?.message || String(r.reason) });
    });

    const elapsed_ms = Date.now() - startMs;
    console.log('[parallel] Done. ' + files.length + '/' + N + ' images in ' + elapsed_ms + 'ms');
    if (failures.length) console.warn('[parallel] Failures: ' + JSON.stringify(failures));

    return {
      ok: files.length === N,
      files,
      outputDir: finalOutDir,
      projectUrl,
      elapsed_ms,
      failures,
    };
  } finally {
    if (ctx) { try { await ctx.close(); } catch (_) {} }
  }
}
