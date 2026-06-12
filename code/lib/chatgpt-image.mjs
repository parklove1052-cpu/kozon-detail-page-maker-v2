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

  // 1) ChatGPT 사이드바의 프로젝트 row 는 `role=button` + `aria-expanded` + `data-sidebar-item=true`
  //    row 안의 `div.truncate` 텍스트가 projectName 정확 매치인 것만
  //    (textContent로 잡으면 "고정됨" 섹션 헤더가 자식 텍스트까지 합쳐서 잘못 매치)
  async function findProjectRow() {
    const rows = await page.$$('[role="button"][aria-expanded][data-sidebar-item="true"]');
    for (const r of rows) {
      try {
        const ownText = await r.evaluate(el => {
          const t = el.querySelector('div.truncate');
          return t ? t.textContent.trim() : '';
        });
        if (ownText === projectName && await r.isVisible()) return r;
      } catch (_) {}
    }
    return null;
  }

  let target = await findProjectRow();
  if (!target) {
    await dumpDiagnostic(page, 'project_not_found');
    throw new Error('Sidebar row not found: "' + projectName + '" (role=button + aria-expanded). Diagnostic dumped.');
  }

  // 2) 펼침 확인 — aria-expanded 신뢰하지 말고, 하위 conversation anchor 개수로 진짜 펼침 검사
  async function isExpanded() {
    const ariaExp = await target.getAttribute('aria-expanded').catch(() => null);
    if (ariaExp === 'true') {
      // 하위 conversation anchor가 1개 이상 실제로 보이는지 추가 확인 (aria/render desync 방지)
      const all = await page.$$('a[data-sidebar-item="true"]');
      for (const a of all) {
        try {
          const label = (await a.getAttribute('aria-label')) || '';
          if (label.includes(projectName) && await a.isVisible()) return true;
        } catch (_) {}
      }
      return false; // aria-expanded=true이지만 실제 렌더는 안 됨 (잘못된 상태)
    }
    return false;
  }

  if (await isExpanded()) {
    console.log('[project] already expanded — skip toggle');
    return page.url();
  }

  // 3) 펼침 시도 — hover + click + 5초 대기 (충분한 React 렌더 시간)
  await target.scrollIntoViewIfNeeded().catch(() => {});
  console.log('[project] Try (A): hover + click + 5s');
  await target.hover().catch(() => {});
  await page.waitForTimeout(300);
  await target.click().catch(e => console.warn('  click err: ' + e.message));
  await page.waitForTimeout(5000);
  if (await isExpanded()) { console.log('[project] expanded via click'); return page.url(); }

  // 4) 마우스 좌표 직접 click — Playwright high-level click이 React Aria와 안 맞을 때 폴백
  console.log('[project] Try (B): mouse.click on bounding box center');
  try {
    const box = await target.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.waitForTimeout(150);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.up();
      await page.waitForTimeout(5000);
      if (await isExpanded()) { console.log('[project] expanded via mouse.click coords'); return page.url(); }
    }
  } catch (e) { console.warn('  coord click err: ' + e.message); }

  // 실패 — 진단 dump + 명확한 에러
  await dumpDiagnostic(page, 'project_expand_failed');
  throw new Error(
    '"' + projectName + '" 사이드바 펼침 실패 (2가지 방법 모두). 우회 안내: ' +
    'ChatGPT 브라우저에서 사장님이 직접 "프로젝트(조)"를 한 번 펼쳐 두신 뒤 chatgpt-profile에 그 상태가 저장되도록 한 다음 다시 시도해 주세요. ' +
    '또는 사장님이 직접 그 안에서 새 대화 N개 미리 만들어 두시면 첫 진입 시 펼침 상태 유지될 수 있습니다. ' +
    '진단 자료: code/generated/_diag_project_expand_failed_*.png'
  );
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

  // 사이드바를 끝까지 스크롤해서 모든 conversation 노출 (virtualized list 대응)
  async function scrollSidebarToBottom() {
    try {
      // 사이드바 scrollable container 찾기
      const sidebarSelectors = ['nav', 'aside', '[role="navigation"]'];
      for (const ss of sidebarSelectors) {
        const sidebar = await page.$(ss);
        if (!sidebar) continue;
        // 스크롤 가능한 자식 찾기 + 끝까지 스크롤
        const scrolled = await sidebar.evaluate(el => {
          const findScrollable = (root) => {
            if (root.scrollHeight > root.clientHeight + 4) return root;
            for (const c of root.children) {
              const r = findScrollable(c);
              if (r) return r;
            }
            return null;
          };
          const sc = findScrollable(el);
          if (sc) {
            const prev = sc.scrollTop;
            sc.scrollTop = sc.scrollHeight;
            return { ok: true, before: prev, after: sc.scrollTop, height: sc.scrollHeight };
          }
          return { ok: false };
        }).catch(() => ({ ok: false }));
        if (scrolled && scrolled.ok) {
          console.log('[conv] Sidebar scrolled to ' + scrolled.after + '/' + scrolled.height);
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  async function countMatched() {
    const anchors = await page.$$('a[data-sidebar-item="true"]');
    let matched = 0;
    for (const a of anchors) {
      try {
        const label = (await a.getAttribute('aria-label')) || '';
        if (label.includes(projectName)) matched++;
      } catch (_) {}
    }
    return { anchors, matched };
  }

  // 1) 초기 검색 — 항목이 count개 이상 잡힐 때까지 폴링 (최대 5초)
  let { anchors, matched } = await countMatched();
  const initialDeadline = Date.now() + 5000;
  while (matched < count && Date.now() < initialDeadline) {
    await page.waitForTimeout(400);
    ({ anchors, matched } = await countMatched());
  }

  // 2) 부족하면 사이드바 스크롤해서 hidden conversation 로드 (최대 4회 반복)
  let scrollAttempts = 0;
  while (matched < count && scrollAttempts < 4) {
    const scrolled = await scrollSidebarToBottom();
    if (!scrolled) break;
    await page.waitForTimeout(800);
    ({ anchors, matched } = await countMatched());
    scrollAttempts++;
    console.log('[conv] After scroll ' + scrollAttempts + ': matched=' + matched);
  }

  // 3) "더 보기" 버튼 자동 클릭 — 프로젝트(조) 펼침 영역 안 ps-9 들여쓰기 button만 (다른 섹션 영향 X)
  async function clickProjectMoreButton() {
    const buttons = await page.$$('button.ps-9[data-sidebar-item="true"], button[class*="ps-9"][data-sidebar-item="true"]');
    for (const b of buttons) {
      try {
        const txt = await b.evaluate(el => {
          const t = el.querySelector('div.truncate');
          return t ? t.textContent.trim() : '';
        });
        if (txt === '더 보기' || txt === 'Show more' || txt === 'See more') {
          if (await b.isVisible()) {
            await b.scrollIntoViewIfNeeded().catch(() => {});
            await b.click().catch(() => {});
            console.log('[conv] Clicked "더 보기" in project area');
            await page.waitForTimeout(1500);
            return true;
          }
        }
      } catch (_) {}
    }
    return false;
  }

  let moreAttempts = 0;
  while (matched < count && moreAttempts < 5) {
    const clicked = await clickProjectMoreButton();
    if (!clicked) break;
    await page.waitForTimeout(1000);
    ({ anchors, matched } = await countMatched());
    moreAttempts++;
    console.log('[conv] After "더 보기" ' + moreAttempts + ': matched=' + matched);
  }

  // 3) 최종 anchor 목록에서 URL/label 추출
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

// 페이지 안 현재 보이는 모든 estuary/oaiusercontent 이미지 URL 수집
// 제출 직전 호출 → 응답 후 비교해서 "새로 등장한" 이미지만 잡기 위함
async function captureExistingImageUrls(page) {
  const urls = new Set();
  for (const sel of IMG_SELECTORS) {
    try {
      const imgs = await page.$$(sel);
      for (const im of imgs) {
        const src = await im.getAttribute('src').catch(() => null);
        if (src && src.startsWith('http')) urls.add(src);
      }
    } catch (_) {}
  }
  return urls;
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
  // 제출 직전: 현재 페이지에 이미 보이는 estuary 이미지 URL 캡처
  // (그 대화의 옛 응답 이미지 — 이걸 우리 새 응답 이미지로 잘못 잡지 않게)
  const beforeUrls = await captureExistingImageUrls(page);
  if (beforeUrls.size > 0) {
    console.log('[parallel] Tab ' + tabIdx + ' captured ' + beforeUrls.size + ' pre-existing image(s)');
  }

  await page.waitForTimeout(300);
  await inputEl.press('Enter');
  console.log('[parallel] Tab ' + tabIdx + ' prompt submitted' + (attachPath ? ' (with attached image)' : ''));
  return beforeUrls;
}

// 응답 생성 중인지 감지 — "Stop generating" 같은 정지 버튼이 보이면 아직 생성 중
async function isStillGenerating(page) {
  const generatingSels = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="정지"]',
    'button[aria-label*="중지"]',
  ];
  for (const sel of generatingSels) {
    try {
      const b = await page.$(sel);
      if (b && await b.isVisible()) return true;
    } catch (_) {}
  }
  return false;
}

async function waitAndDownloadOnPage(page, tabIdx, destPath, timeoutMs, beforeUrls) {
  const before = beforeUrls instanceof Set ? beforeUrls : new Set();
  const deadline = Date.now() + timeoutMs;
  let lastSeenCount = before.size;

  while (Date.now() < deadline) {
    // 1) 새로 등장한 estuary 이미지 src만 후보로 수집 (before set에 없는 것)
    const newSrcs = [];
    for (const sel of IMG_SELECTORS) {
      try {
        const imgs = await page.$$(sel);
        for (const im of imgs) {
          const src = await im.getAttribute('src').catch(() => null);
          if (src && src.startsWith('http') && !before.has(src) && !newSrcs.includes(src)) {
            newSrcs.push(src);
          }
        }
      } catch (_) {}
    }

    // 2) 새 이미지가 보이고 + ChatGPT가 더 이상 생성 중이 아니면 다운로드
    if (newSrcs.length > 0) {
      const stillGen = await isStillGenerating(page);
      if (!stillGen) {
        // 가장 마지막에 추가된 이미지가 새 응답 본인 — 보통 newSrcs[newSrcs.length-1]
        // 단 ChatGPT가 메인 이미지 + thumbnail 두 src 같이 만들 수 있어서 두 개 다 같은 file_id 이면 동일
        // 우선 마지막 추가 src 우선 사용 (가장 최근 응답)
        const candidate = newSrcs[newSrcs.length - 1];
        try {
          const r = await page.request.get(candidate);
          if (r.ok()) {
            writeFileSync(destPath, await r.body());
            console.log('[parallel] Tab ' + tabIdx + ' saved NEW image: ' + destPath);
            return { ok: true, src: candidate, dest: destPath };
          }
        } catch (e) {
          console.warn('[parallel] Tab ' + tabIdx + ' download failed: ' + e.message);
        }
      } else if (newSrcs.length !== lastSeenCount) {
        console.log('[parallel] Tab ' + tabIdx + ' has ' + newSrcs.length + ' new src(s) but still generating — wait...');
        lastSeenCount = newSrcs.length;
      }
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  // 타임아웃 — 진단 dump
  await dumpDiagnostic(page, 'parallel_tab' + tabIdx);
  throw new Error('Tab ' + tabIdx + ' timeout — no NEW image after generation. Diagnostic dumped.');
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

    // 3) stagger로 프롬프트 발사 — 각 탭의 "제출 직전 기존 이미지 URL set" 수집
    const beforeUrlsByTab = [];
    for (let i = 0; i < N; i++) {
      const before = await submitPromptOnPage(pages[i], prompts[i], i);
      beforeUrlsByTab[i] = before;
      if (i < N - 1) await new Promise(r => setTimeout(r, staggerMs));
    }
    console.log('[parallel] All ' + N + ' prompts submitted. Awaiting NEW images...');

    // 4) 동시 결과 대기 + 다운로드 — 각 탭의 beforeUrls 전달해서 옛 이미지 무시
    const ts = Date.now();
    const results = await Promise.allSettled(pages.map((p, i) => {
      const dest = join(finalOutDir, String(i + 1).padStart(2, '0') + '_' + ts + '.png');
      return waitAndDownloadOnPage(p, i, dest, perTabTimeoutMs, beforeUrlsByTab[i]);
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
