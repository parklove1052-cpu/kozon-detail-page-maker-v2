// 직전 시도(_last_prompt.txt)를 --tools "" 적용해 다시 호출하고 결과를 output/에 저장
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';

const PROMPT_PATH = path.join(import.meta.dirname, 'uploads', '_last_prompt.txt');
const OUTPUT_DIR = path.join(import.meta.dirname, '..', 'output');
const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

console.log(`[restore] prompt 길이: ${prompt.length}자`);
console.log('[restore] claude 호출 (--tools "") — 1~5분 소요 예상');
const t0 = Date.now();

const proc = spawn('cmd.exe',
  ['/c', 'chcp 65001 >nul && claude -p --output-format text --tools ""'],
  { cwd: import.meta.dirname, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

let stdout = '', stderr = '';
proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
proc.stdout.on('data', d => stdout += d);
proc.stderr.on('data', d => stderr += d);

const timer = setTimeout(() => {
  try { exec(`taskkill /T /F /PID ${proc.pid}`, () => {}); } catch (_) {}
  console.error('[restore] 타임아웃 6분');
  process.exit(2);
}, 360000);

proc.on('close', (code) => {
  clearTimeout(timer);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[restore] 종료코드 ${code}, ${elapsed}초, stdout ${stdout.length}자`);
  console.log('[restore] stdout 전체 ↓');
  console.log(stdout);
  console.log('[restore] stderr 전체 ↓');
  console.log(stderr);
  if (code !== 0) process.exit(1);
  // HTML 코드 블록 추출
  const m = /```(?:html)?\s*([\s\S]*?)```/i.exec(stdout);
  let html;
  if (m && /<\w+/.test(m[1])) html = m[1].trim();
  else if (/<!DOCTYPE/i.test(stdout) || /<html[\s>]/i.test(stdout)) html = stdout.trim();
  if (!html) {
    console.warn('[restore] HTML 추출 실패 — raw로 저장');
    const raw = path.join(OUTPUT_DIR, `detail_raw_restored_${Date.now()}.txt`);
    fs.writeFileSync(raw, stdout, 'utf-8');
    console.log('[restore] raw 저장:', raw);
    process.exit(0);
  }
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const out = path.join(OUTPUT_DIR, `detail_${ts}_restored_modern_kwayeon.html`);
  fs.writeFileSync(out, html, 'utf-8');
  console.log(`[restore] ✓ HTML 저장: ${out}`);
  console.log(`[restore]   크기: ${(html.length/1024).toFixed(1)}KB`);
});

proc.stdin.write(prompt, 'utf-8');
proc.stdin.end();
