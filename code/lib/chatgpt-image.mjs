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
const GENERATION_TIMEOUT_MS = 90 * 1000;
const POLL_INTERVAL_MS      = 3000;
const CHATGPT_CHAT_URL = 'https://chatgpt.com/?model=gpt-4o';

// Input box selector candidates (tried in order; first visible one wins)
const INPUT_SELECTORS = [
  '#prompt-textarea',
  'textarea[placeholder]',
  '[contenteditable="true"][data-testid]',
  '[contenteditable="true"].ProseMirror',
  '[contenteditable="true"]',
];

// Image selector candidates in the ChatGPT assistant response area
const IMG_SELECTORS = [
  'div[data-message-author-role="assistant"] img[src*="oaiusercontent.com"]',
  'img[src*="oaiusercontent.com"]',
  'img[src*="files.oaiusercontent"]',
  'div[data-message-author-role="assistant"] img[src^="https"]',
  '.markdown img[src^="https"]',
];

async function isLoggedIn(page) {
  const url = page.url();
  if (url.includes('/auth/login') || url.includes('/auth/') ||
      url.includes('login.openai') || url.includes('accounts.openai')) return false;
  try {
    const sel = '[data-testid="new-chat-button"], [aria-label="New chat"], nav[aria-label]';
    const els = await page.$$(sel);
    return els.length > 0;
  } catch (_) { return false; }
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
  return null;
}

async function waitForImages(page, count) {
  console.log('[chatgpt-image] Waiting for image generation (max 90s)...');
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
  throw new Error('Generation timeout: no image appeared in 90s. Update IMG_SELECTORS in chatgpt-image.mjs if ChatGPT changed its DOM.');
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

    for (let i = 0; i < srcs.length; i++) {
      const dest = join(GENERATED_DIR, ts + '_' + (i + 1) + '.png');
      console.log('[chatgpt-image] Downloading image ' + (i + 1) + '/' + srcs.length + '...');
      try {
        await downloadUrl(srcs[i], dest);
        files.push(dest);
        console.log('[chatgpt-image] Saved: ' + dest);
      } catch (e1) {
        console.warn('[chatgpt-image] Direct download failed: ' + e1.message + '. Trying page.request...');
        try {
          const r = await page.request.get(srcs[i]);
          if (r.ok()) {
            writeFileSync(dest, await r.body());
            files.push(dest);
            console.log('[chatgpt-image] Saved via page.request: ' + dest);
          }
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
