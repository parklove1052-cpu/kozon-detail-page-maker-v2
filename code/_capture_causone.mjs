// Causone Power Energy Bar — capture & split for Coupang
// Usage: node capture.mjs
import { chromium } from 'playwright';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 산출물 폴더는 code/ 옆 output/causone_power_energy_bar/
const OUT_DIR = path.resolve(__dirname, '..', 'output', 'causone_power_energy_bar');
const HTML_PATH = path.join(OUT_DIR, 'index.html');
const FULL_PNG = path.join(OUT_DIR, 'full_1000.png');
const JPEG_DIR = path.join(OUT_DIR, 'jpeg');

// 쿠팡 권장: 폭 780px, 한 장 세로 ≤ 3000px
const COUPANG_WIDTH = 780;
const SLICE_MAX_H = 3000;
const JPEG_QUALITY = 90;

await fs.mkdir(JPEG_DIR, { recursive: true });

// 1) Playwright로 1000px 폭 fullPage 캡처
console.log('[1/3] launching chromium...');
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1000, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const url = pathToFileURL(HTML_PATH).toString();
console.log('     navigating to', url);
await page.goto(url, { waitUntil: 'networkidle' });

// 폰트 로드 대기
await page.evaluate(async () => {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
});
await page.waitForTimeout(800);

console.log('[2/3] fullPage screenshot...');
await page.screenshot({ path: FULL_PNG, fullPage: true, type: 'png' });
await browser.close();

// 2) sharp로 폭 780으로 리사이즈 + 슬라이스
console.log('[3/3] resize → 780px width, slice ≤', SLICE_MAX_H, 'px, JPEG ...');
const baseImg = sharp(FULL_PNG);
const meta = await baseImg.metadata();
console.log('     fullPage size =', meta.width, 'x', meta.height);

// 리사이즈 (deviceScaleFactor 2였으니 실제 폭은 2000) → 780으로 다운
const resizedBuf = await sharp(FULL_PNG)
  .resize({ width: COUPANG_WIDTH })
  .toBuffer();
const resized = sharp(resizedBuf);
const rm = await resized.metadata();
console.log('     resized size  =', rm.width, 'x', rm.height);

const W = rm.width;
const H = rm.height;
let i = 1;
let y = 0;
const outFiles = [];
while (y < H) {
  const h = Math.min(SLICE_MAX_H, H - y);
  const fname = `causone_power_energy_bar_${String(i).padStart(2, '0')}.jpg`;
  const fpath = path.join(JPEG_DIR, fname);
  await sharp(resizedBuf)
    .extract({ left: 0, top: y, width: W, height: h })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(fpath);
  console.log('     wrote', fname, `(${W} x ${h})`);
  outFiles.push({ fname, w: W, h });
  y += h;
  i += 1;
}

console.log('\n=== DONE ===');
console.log('JPEG count:', outFiles.length);
console.log('Saved to  :', JPEG_DIR);
