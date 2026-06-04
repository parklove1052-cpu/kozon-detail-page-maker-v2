'use strict';
// PicCopilot 작업물 URL을 Playwright로 렌더링해서 비로그인 상태 접근 가능 여부 확인.
// 본문이 보이면 → 다른 작업물 ID도 동일 방식으로 추출 가능
// "로그인이 필요합니다" 같은 화면 뜨면 → 로그인 자동화 또는 사장님 쿠키 export 필요

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'https://www.piccopilot.com/ai-product-page-design-generator?materialIds=42808972';
const OUT_DIR = path.join(__dirname, '..', '..', 'output', 'picco_dump');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[picco] 브라우저 시작...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  console.log(`[picco] 이동: ${URL}`);
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (e) {
    console.log(`[picco] networkidle 도달 못 함(${e.message.slice(0, 80)}) — 페이지 그대로 진행`);
  }
  // JS 렌더 추가 대기
  await page.waitForTimeout(4000);
  // 본문 텍스트 + HTML + 스크린샷
  const html = await page.content();
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText || '');
  const url = page.url();
  const screenshotPath = path.join(OUT_DIR, 'material_42808972.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  // 작업물 영역 / iframe / canvas 등 인덱스
  const iframes = await page.$$eval('iframe', els => els.map(el => ({ src: el.src, name: el.name })));
  const canvases = await page.$$('canvas');
  // localStorage 일부 (작업물 캐시 단서)
  const ls = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = (localStorage.getItem(k) || '').slice(0, 120);
    }
    return out;
  });

  fs.writeFileSync(path.join(OUT_DIR, 'material_42808972.html'), html, 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'material_42808972_text.txt'), text, 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'material_42808972_meta.json'), JSON.stringify({
    finalUrl: url, title, htmlLength: html.length, textLength: text.length,
    iframes, canvases: canvases.length, localStorageKeys: Object.keys(ls), localStoragePreview: ls,
  }, null, 2), 'utf-8');

  console.log('━━━ 결과 ━━━');
  console.log(`최종 URL: ${url}`);
  console.log(`title: ${title}`);
  console.log(`HTML: ${(html.length/1024).toFixed(1)}KB / 본문 텍스트: ${text.length}자`);
  console.log(`iframe ${iframes.length}개, canvas ${canvases.length}개`);
  console.log(`localStorage 키: ${Object.keys(ls).length}개`);
  console.log(`스크린샷: ${screenshotPath}`);
  console.log('\n[본문 텍스트 첫 800자]');
  console.log(text.slice(0, 800));
  console.log('\n[로그인 차단·인증 요구 단서]');
  const blockers = /login|sign in|로그인|sign up|회원|authentication required|access denied|forbidden|404/i;
  const found = (text.match(blockers) || html.match(blockers));
  console.log(found ? `발견: "${(found[0] || '').toString().slice(0, 80)}"` : '없음 → 비로그인 접근 가능 신호');

  await browser.close();
})().catch((e) => { console.error('[picco] 실패:', e); process.exit(1); });
