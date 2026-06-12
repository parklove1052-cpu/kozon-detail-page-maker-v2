#!/usr/bin/env node
// 코존 상세페이지 제작자 - 자동 셋업 스크립트
//
// 사용법:
//   node scripts/setup.mjs              # 사람 친화적 출력
//   node scripts/setup.mjs --json       # 마지막에 결과 JSON 한 줄 (Claude Code 파싱용)
//   node scripts/setup.mjs --skip-npm   # npm install 스킵
//   node scripts/setup.mjs --skip-playwright   # Playwright 스킵
//
// Claude Code 사용 시: 결과 JSON의 nextActions 배열을 보고 사장님께 안내.

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOMAIN_ROOT = resolve(__dirname, '..');
const CODE_DIR = join(DOMAIN_ROOT, 'code');
const CONFIG_PATH = join(CODE_DIR, 'config.json');

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  skipNpm: args.includes('--skip-npm'),
  skipPlaywright: args.includes('--skip-playwright'),
};

const result = {
  ok: true,
  domainRoot: DOMAIN_ROOT,
  steps: [],
  nextActions: [],
};

function log(msg) {
  if (!flags.json) console.log(msg);
}

function step(name, status, detail) {
  result.steps.push({ name, status, detail });
  log(`[${status === 'ok' ? 'OK' : status === 'skip' ? '--' : 'X '}] ${name}${detail ? ' — ' + detail : ''}`);
  if (status === 'fail') result.ok = false;
}

function which(cmd) {
  const isWin = process.platform === 'win32';
  const finder = isWin ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim();
  return null;
}

// ── 1. Node 버전 ──────────────────────────────────────
const nodeVersion = process.versions.node;
const major = parseInt(nodeVersion.split('.')[0], 10);
if (major >= 18) {
  step('Node.js 버전', 'ok', `v${nodeVersion}`);
} else {
  step('Node.js 버전', 'fail', `v${nodeVersion} (18 이상 필요)`);
  result.nextActions.push({
    type: 'install',
    target: 'node',
    message: 'Node.js 18 LTS 이상을 설치해주세요: https://nodejs.org/',
  });
}

// ── 2. config.json 절대경로 치환 ──────────────────────
if (!existsSync(CONFIG_PATH)) {
  step('code/config.json 존재', 'fail', CONFIG_PATH);
  result.nextActions.push({
    type: 'error',
    message: 'code/config.json 이 없습니다. repo 클론이 손상된 것 같습니다.',
  });
} else {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    // 기존에 박혀있는 절대경로 패턴 (사장님 PC 기준)
    const OLD_PATH = 'C:\\Users\\MYCOM\\Documents\\조현준편집파일 329부터\\클로드코드\\코존워크스페이스\\domains\\상세페이지 제작자';
    const NEW_PATH = DOMAIN_ROOT;

    if (raw.includes(NEW_PATH.replace(/\\/g, '\\\\'))) {
      step('config.json 경로', 'ok', '이미 현재 PC 경로');
    } else if (raw.includes(OLD_PATH.replace(/\\/g, '\\\\'))) {
      // JSON 안에서는 백슬래시가 \\ 로 이스케이프되어 있음
      const escapedOld = OLD_PATH.replace(/\\/g, '\\\\');
      const escapedNew = NEW_PATH.replace(/\\/g, '\\\\');
      const updated = raw.split(escapedOld).join(escapedNew);
      writeFileSync(CONFIG_PATH, updated, 'utf8');
      step('config.json 경로', 'ok', '현재 PC 경로로 치환 완료');
    } else {
      step('config.json 경로', 'skip', '치환할 기준 경로를 찾지 못함 (수동 확인 필요)');
      result.nextActions.push({
        type: 'manual',
        message: 'code/config.json 의 domain_path 항목들이 현재 PC의 도메인 루트와 일치하는지 확인해주세요.',
      });
    }
  } catch (e) {
    step('config.json 경로', 'fail', e.message);
    result.ok = false;
  }
}

// ── 3. npm install ────────────────────────────────────
if (flags.skipNpm) {
  step('npm install', 'skip', '--skip-npm 플래그');
} else {
  try {
    log('\n[ ... ] code/ 에서 npm install 실행 중 (1-3분 소요)...');
    execSync('npm install', { cwd: CODE_DIR, stdio: flags.json ? 'pipe' : 'inherit' });
    step('npm install', 'ok');
  } catch (e) {
    step('npm install', 'fail', e.message.split('\n')[0]);
    result.nextActions.push({
      type: 'manual',
      message: 'code/ 에서 npm install 을 수동으로 재실행하고 오류를 확인해주세요.',
    });
  }
}

// ── 4. Playwright Chromium ────────────────────────────
if (flags.skipPlaywright) {
  step('Playwright Chromium', 'skip', '--skip-playwright 플래그');
} else {
  try {
    log('\n[ ... ] Playwright Chromium 다운로드 (이미 있으면 즉시 종료)...');
    execSync('npx playwright install chromium', { cwd: CODE_DIR, stdio: flags.json ? 'pipe' : 'inherit' });
    step('Playwright Chromium', 'ok');
  } catch (e) {
    // Playwright 실패는 치명적 아님 (JPEG 캡처 미사용 시)
    step('Playwright Chromium', 'skip', '설치 실패 — JPEG 캡처 기능 사용 시 수동 설치 필요');
    result.nextActions.push({
      type: 'manual',
      message: 'Playwright 자동 설치가 실패했습니다. JPEG 캡처 기능을 사용하려면 code/ 에서 "npx playwright install chromium" 을 수동 실행해주세요.',
    });
  }
}

// ── 5. 결과 요약 ──────────────────────────────────────
if (!flags.json) {
  console.log('\n=================================================');
  console.log('  셋업 ' + (result.ok ? '완료' : '일부 실패'));
  console.log('=================================================');
  if (result.nextActions.length > 0) {
    console.log('\n다음 단계:');
    result.nextActions.forEach((a, i) => console.log(`  ${i + 1}. ${a.message}`));
  } else {
    console.log('\n다음 단계: scripts/check-auth.mjs 로 인증 상태 점검 → 문제 없으면 code/ 에서 node server.js 로 서버 시작');
  }
}

// JSON 출력 (Claude Code가 파싱)
if (flags.json) {
  console.log(JSON.stringify(result, null, 2));
}

process.exit(result.ok ? 0 : 1);
