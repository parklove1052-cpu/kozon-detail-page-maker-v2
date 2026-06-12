/**
 * test_ui_full_flow.mjs
 * Phase E — Playwright로 상세페이지 제작기 도구 UI 통째 자동 테스트
 *
 * 흐름:
 *   1) http://127.0.0.1:7777 진입
 *   2) Step 1: 사과 PNG를 dropzone-product에 업로드 + 카피 입력 + 스타일 선택
 *   3) 「① 기획 + 이미지 프롬프트 생성」 클릭 → plan 응답 대기
 *   4) 「⚡ ChatGPT(조)로 자동 생성」 클릭 → 잡 완료 + 슬롯 채움 + 자동 ② 트리거 대기
 *   5) 최종 HTML 생성 결과 확인 + 다운로드 영역 캡처
 *   6) 각 단계 스크린샷 저장 (`code/generated/_ui_test_<단계>.png`)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const CODE_ROOT   = join(__dirname, '..');
const DOMAIN_ROOT = join(CODE_ROOT, '..');
const GENERATED_DIR = join(CODE_ROOT, 'generated');
const APPLE_PNG = join(GENERATED_DIR, 'parallel_1781271101571', '01_1781271147610.png');

const COPY = '이 빨간 사과는 자연 그대로의 신선함을 담은 프리미엄 사과입니다. 매끈한 표면, 깊은 향, 한 입 베어물면 입안에 퍼지는 달콤한 과즙. 도시 사람들의 식탁에 자연을 선물합니다. 농장에서 직배송, 24시간 안에 도착.';

const STYLE = 'premium';
const CONTENT_STYLE = 'emotion';

const TOOL_URL = 'http://127.0.0.1:7777/';

if (!existsSync(APPLE_PNG)) {
  console.error('사과 PNG 파일 없음:', APPLE_PNG);
  process.exit(1);
}

const SHOTS_DIR = join(GENERATED_DIR, '_ui_test_' + Date.now());
mkdirSync(SHOTS_DIR, { recursive: true });

function shot(page, name) {
  return page.screenshot({ path: join(SHOTS_DIR, name + '.png'), fullPage: true }).catch(() => {});
}
function log(...a) { console.log('[ui-test]', ...a); }

const browser = await chromium.launch({
  headless: false,
  args: ['--window-position=100,80', '--window-size=1400,900'],
  viewport: { width: 1400, height: 900 },
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[browser-error]', m.text()); });

const startMs = Date.now();
try {
  log('Navigating to', TOOL_URL);
  await page.goto(TOOL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 서버 health probe → 자동 redirect to /index.html
  await page.waitForURL(/index\.html|7777/, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('#btn-plan', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, '01_loaded');
  log('Tool UI loaded');

  // Step 1: 사과 PNG 업로드
  log('Uploading apple PNG...');
  await page.setInputFiles('#file-input-product', APPLE_PNG);
  await page.waitForTimeout(1500);
  await shot(page, '02_image_uploaded');

  // 카피 입력
  await page.fill('#content-text', COPY);
  await page.waitForTimeout(500);

  // 스타일 선택 (이미 기본값 premium이지만 안전하게)
  await page.selectOption('#style-select', STYLE).catch(() => {});
  await page.selectOption('#content-style-select', CONTENT_STYLE).catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '03_step1_filled');
  log('Step 1 filled');

  // 「① 기획 + 이미지 프롬프트 생성」 클릭
  log('Clicking 「① 기획」 button...');
  await page.click('#btn-plan');
  // plan 응답 대기 — prompt-cards 가 채워지거나 prompt-toolbar 가 보일 때까지 (최대 5분)
  await page.waitForSelector('#prompt-toolbar:not([hidden])', { timeout: 5 * 60 * 1000 });
  await page.waitForTimeout(2000);
  await shot(page, '04_plan_done');
  const totalSlots = await page.locator('#prompt-total').textContent();
  log('Plan done. Total slots:', totalSlots);

  // ① 클릭이 끝나면 callPlan 끝에서 autoGenerateViaChatGPT가 자동 호출됨 (hint 약속).
  // 별도로 「⚡ ChatGPT(조)로 자동 생성」 버튼은 누를 필요 없음.
  log('Waiting for auto ChatGPT job (callPlan 끝 → autoGenerateViaChatGPT 자동 호출)...');

  // ChatGPT 잡 + 슬롯 채움 대기 — #auto-chatgpt-status 가 ✅ 로 갈 때까지 (최대 15분)
  let chatgptDone = false;
  const deadline2 = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline2) {
    await page.waitForTimeout(5000);
    const status = await page.locator('#auto-chatgpt-status').textContent().catch(() => '');
    log('  chatgpt-status:', (status || '').slice(0, 120));
    if (status && status.includes('슬롯 자동 채움 완료')) { chatgptDone = true; break; }
    if (status && status.startsWith('❌')) { log('FAILED status:', status); break; }
  }
  await shot(page, '05_chatgpt_done');
  if (!chatgptDone) {
    log('ChatGPT 자동 생성 미완료 → timeout');
    process.exit(1);
  }

  // ② 「상세페이지 HTML 생성」 클릭 (autoChain=false라 사장님 또는 테스트가 수동 클릭)
  log('Clicking 「② 상세페이지 HTML 생성」 button...');
  await page.waitForTimeout(2000);
  await page.click('#btn-generate');

  // generate-result 가 보일 때까지 대기 (최대 10분)
  log('Waiting for HTML generation result...');
  const deadline3 = Date.now() + 10 * 60 * 1000;
  let done = false;
  while (Date.now() < deadline3) {
    await page.waitForTimeout(5000);
    const resultVisible = await page.locator('#generate-result').isVisible().catch(() => false);
    if (resultVisible) { done = true; break; }
  }
  await shot(page, '06_html_generated');
  if (!done) {
    log('HTML generation result not visible → timeout');
    process.exit(1);
  }

  await page.waitForTimeout(3000);
  await shot(page, '06_generate_done');

  // 결과 다운로드 영역 보이는지
  const downloadBtnEnabled = await page.locator('#btn-download-html').isEnabled().catch(() => false);
  log('Download button enabled:', downloadBtnEnabled);

  const savedPath = await page.locator('#saved-path-info').textContent().catch(() => '');
  log('Saved path info:', savedPath);

  const elapsedMs = Date.now() - startMs;
  log('');
  log('🎉 FULL UI FLOW SUCCESS');
  log('Elapsed     :', elapsedMs + 'ms (' + Math.round(elapsedMs/1000) + 's)');
  log('Shots dir   :', SHOTS_DIR);
  log('Saved info  :', savedPath);
  process.exit(0);

} catch (err) {
  console.error('[ui-test] ERROR:', err.message);
  await shot(page, '99_error');
  console.error('Shots dir:', SHOTS_DIR);
  process.exit(1);
} finally {
  // 페이지를 잠시 살려둠 (사장님이 화면 보실 수 있게)
  await page.waitForTimeout(5000).catch(() => {});
  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
}
