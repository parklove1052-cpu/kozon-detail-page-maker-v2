// v0.7.1 — Higgsfield CLI 직접 호출 래퍼
//
// 사장님 PC에 `higgsfield` CLI(글로벌)가 설치되어 있고 `higgsfield auth login` 완료 가정.
// 설치 : npm install -g @higgsfield/cli
// 인증 : higgsfield auth login
//
// 본 모듈은 server.js → spawn('higgsfield', ['generate', ...]) → PNG 저장까지 처리.
// MCP 호출(Claude 위임) 없이 1단 spawn — 토큰 비용 0, 속도 빠름.
//
// ※ 정확한 명령 인자는 사장님 환경에서 `higgsfield generate --help`로 검증한 후
//   `buildArgs()`를 보강해야 함. 현재는 일반적인 CLI 패턴을 가정한 잠정 구현.

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 180000; // 3분 — 이미지 1장당
const DEFAULT_BIN = process.env.HIGGSFIELD_CLI_BIN || 'higgsfield';

// 모델 별칭 → CLI 모델명 (사장님 검증 후 매핑 확정)
const MODEL_ALIAS = {
  'gpt-image-2': 'gpt-image-2',
  'soul-2': 'soul',
  'soul': 'soul',
  'nano-banana-pro': 'nano-banana-pro',
  'seedream-4': 'seedream',
  'flux-2-pro': 'flux',
};

function resolveModel(model) {
  const key = String(model || 'gpt-image-2').toLowerCase().trim();
  return MODEL_ALIAS[key] || key;
}

/**
 * CLI 인자 빌드 — 일반적인 패턴 가정. 사장님 `--help` 결과 확인 후 보강.
 * 일반적인 옵션:
 *   higgsfield generate text-to-image \
 *     --prompt "..." \
 *     --model gpt-image-2 \
 *     --aspect-ratio 3:4 \
 *     --output /path/file.png \
 *     --format json
 */
function buildArgs({ prompt, model, ratio, savePath, extra }) {
  const args = ['generate'];
  // 대부분의 CLI는 subcommand 분리 — 'image' 또는 'text-to-image'
  // 잠정으로 'image' 사용. 검증 후 변경 가능.
  args.push('image');
  args.push('--prompt', prompt);
  args.push('--model', resolveModel(model));
  if (ratio) args.push('--aspect-ratio', ratio);
  if (savePath) args.push('--output', savePath);
  args.push('--format', 'json');
  if (Array.isArray(extra)) args.push(...extra);
  return args;
}

/**
 * Higgsfield CLI로 이미지 1장 생성
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} opts.model           — 'gpt-image-2' 등 (alias 자동 변환)
 * @param {string} opts.ratio           — '3:4' 등
 * @param {string} opts.savePath        — 절대 경로 (PNG 저장 위치)
 * @param {object} [opts.jobRef]        — 취소 가능 job 참조 ({ proc?, cancelled? })
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.bin]
 * @param {string[]} [opts.extraArgs]
 * @returns {Promise<{ok:boolean, path?:string, raw?:string, error?:string, stderr?:string, code?:number}>}
 */
function generate(opts = {}) {
  const {
    prompt, model, ratio, savePath, jobRef,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    bin = DEFAULT_BIN,
    extraArgs,
  } = opts;

  if (!prompt) return Promise.resolve({ ok: false, error: 'prompt 누락' });
  if (!savePath) return Promise.resolve({ ok: false, error: 'savePath 누락' });

  // 출력 디렉토리 자동 생성
  try { fs.mkdirSync(path.dirname(savePath), { recursive: true }); } catch (_) {}

  const args = buildArgs({ prompt, model, ratio, savePath, extra: extraArgs });
  const isWin = process.platform === 'win32';

  return new Promise((resolve) => {
    let proc;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    try {
      // Windows: cmd.exe 경유 (chcp 65001로 UTF-8 강제) — 한글 프롬프트 안전
      if (isWin) {
        // Windows에서 npm 글로벌 bin은 .cmd 래퍼라 직접 spawn 시 EINVAL 가능
        const quoted = args.map((a) => /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a).join(' ');
        proc = spawn('cmd.exe', ['/c', `chcp 65001 >nul && ${bin} ${quoted}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } else {
        proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      }
    } catch (e) {
      return resolve({ ok: false, error: `spawn 실패: ${e.message}` });
    }

    if (jobRef) jobRef.proc = proc;

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGTERM'); setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 2000); } catch (_) {}
    }, timeoutMs);

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `proc error: ${err.message}` });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (jobRef) jobRef.proc = null;
      if (jobRef && jobRef.cancelled) {
        return resolve({ ok: false, error: 'cancelled', code });
      }
      if (timedOut) return resolve({ ok: false, error: `timeout ${timeoutMs}ms`, stderr });

      // JSON 응답 파싱 시도 (Higgsfield CLI가 --format json 지원 가정)
      let parsed = null;
      const trimmed = (stdout || '').trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { parsed = JSON.parse(trimmed); } catch (_) {}
      }

      // 성공 판단: exit 0 + savePath 파일 존재 + size > 0
      const exists = fs.existsSync(savePath);
      const size = exists ? fs.statSync(savePath).size : 0;
      const fileOk = exists && size > 0;

      if (code === 0 && fileOk) {
        return resolve({ ok: true, path: savePath, size, raw: parsed || trimmed.slice(0, 500) });
      }
      // 실패
      const errMsg = stderr.trim().slice(-500) || (code !== 0 ? `exit ${code}` : '저장 검증 실패');
      resolve({ ok: false, error: errMsg, code, stderr: stderr.slice(-500), stdout: trimmed.slice(0, 500) });
    });
  });
}

/**
 * 여러 슬롯 병렬 생성 (concurrency 제한)
 * @param {Array<{id,enPrompt,model,ratio,savePath}>} slots
 * @param {object} [opts]
 * @param {number} [opts.concurrency=2]
 * @param {object} [opts.jobRef]
 */
async function generateMany(slots, opts = {}) {
  const concurrency = Math.max(1, Math.min(8, opts.concurrency || 2));
  const jobRef = opts.jobRef;
  const queue = slots.slice();
  const results = [];
  const workers = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length) {
        if (jobRef && jobRef.cancelled) break;
        const s = queue.shift();
        const r = await generate({
          prompt: s.enPrompt,
          model: s.model,
          ratio: s.ratio,
          savePath: s.savePath,
          jobRef,
        });
        results.push({ slot: s.id, model_requested: s.model, ...r });
      }
    })());
  }

  await Promise.all(workers);
  // 슬롯 순서 보존
  const order = new Map(slots.map((s, i) => [s.id, i]));
  results.sort((a, b) => (order.get(a.slot) ?? 0) - (order.get(b.slot) ?? 0));
  return results;
}

/**
 * CLI 존재 여부 점검 (서버 시작 시 1회)
 */
function checkInstalled(bin = DEFAULT_BIN) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    let stdout = '';
    let stderr = '';
    let proc;
    try {
      if (isWin) proc = spawn('cmd.exe', ['/c', `${bin} --version`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      else proc = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ ok: false, error: e.message });
    }
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => resolve({ ok: false, error: err.message }));
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, version: stdout.trim() || stderr.trim() });
      else resolve({ ok: false, error: `exit ${code}: ${stderr.trim() || stdout.trim()}` });
    });
  });
}

module.exports = {
  generate,
  generateMany,
  checkInstalled,
  resolveModel,
  buildArgs,
  DEFAULT_BIN,
};
