#!/usr/bin/env node
// 코존 상세페이지 제작자 - 인증 상태 점검
//
// 사용법:
//   node scripts/check-auth.mjs           # 사람 친화적 출력
//   node scripts/check-auth.mjs --json    # 마지막에 결과 JSON 한 줄
//
// 점검 대상:
//   - Claude Code CLI (필수, 핵심 카피·HTML 생성용)
//   - Higgsfield CLI (선택, 이미지/영상 생성용 — 이 도구는 글로벌 스킬로 호출)
//   - GitHub CLI (권장, repo pull/push)
//   - Node, npm (필수)
//
// Claude Code 사용 시:
//   미인증 항목마다 nextActions[].command 를 사장님께 그대로 안내 (Claude Code는 실행 X — 사장님이 직접).

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flags = { json: args.includes('--json') };

const result = {
  ok: true,
  checks: [],
  nextActions: [],
};

function log(msg) { if (!flags.json) console.log(msg); }

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: opts.timeout || 10000,
  });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    code: r.status,
  };
}

function check(name, level, status, detail) {
  // level: 'required' | 'recommended' | 'optional'
  // status: 'ok' | 'missing' | 'unauth' | 'unknown'
  result.checks.push({ name, level, status, detail });
  const icon = status === 'ok' ? 'OK' : (status === 'missing' ? 'X ' : (status === 'unauth' ? '!!' : '? '));
  const tag = level === 'required' ? '필수' : level === 'recommended' ? '권장' : '선택';
  log(`[${icon}] (${tag}) ${name}${detail ? ' — ' + detail : ''}`);
  if (status !== 'ok' && level === 'required') result.ok = false;
}

// ── 1. Node ────────────────────────────────────────────
{
  const r = run('node', ['--version']);
  if (r.ok) {
    const v = r.stdout.replace(/^v/, '');
    const major = parseInt(v.split('.')[0], 10);
    if (major >= 18) check('Node.js', 'required', 'ok', `v${v}`);
    else {
      check('Node.js', 'required', 'missing', `v${v} (18 이상 필요)`);
      result.nextActions.push({
        target: 'node',
        message: 'Node.js 18 LTS 이상을 설치해주세요.',
        command: null,
        link: 'https://nodejs.org/',
      });
    }
  } else {
    check('Node.js', 'required', 'missing', '명령을 찾을 수 없음');
    result.nextActions.push({
      target: 'node',
      message: 'Node.js 18 LTS 이상을 설치해주세요.',
      command: null,
      link: 'https://nodejs.org/',
    });
  }
}

// ── 2. npm ─────────────────────────────────────────────
{
  const r = run('npm', ['--version']);
  if (r.ok) check('npm', 'required', 'ok', `v${r.stdout}`);
  else {
    check('npm', 'required', 'missing');
    result.nextActions.push({
      target: 'npm',
      message: 'npm 이 동작하지 않습니다. Node.js 재설치가 필요할 수 있습니다.',
      command: null,
    });
  }
}

// ── 3. Claude Code CLI ────────────────────────────────
{
  const r = run('claude', ['--version'], { timeout: 8000 });
  if (r.ok) {
    check('Claude Code CLI', 'required', 'ok', r.stdout.split('\n')[0]);
  } else {
    check('Claude Code CLI', 'required', 'missing', '`claude` 명령을 찾을 수 없음');
    result.nextActions.push({
      target: 'claude-cli',
      message: 'Claude Code CLI 를 설치해주세요. 설치 후 로그인은 첫 실행 시 자동 안내됩니다.',
      command: 'https://docs.claude.com/en/docs/claude-code/setup 참고',
      link: 'https://docs.claude.com/en/docs/claude-code/setup',
    });
  }
}

// ── 4. Higgsfield CLI (선택) ──────────────────────────
{
  const r = run('higgsfield', ['--version'], { timeout: 8000 });
  if (r.ok) {
    // 로그인 상태 확인
    const auth = run('higgsfield', ['auth', 'status'], { timeout: 8000 });
    if (auth.ok && /logged in|authenticated|active/i.test(auth.stdout + auth.stderr)) {
      check('Higgsfield CLI', 'recommended', 'ok', r.stdout.split('\n')[0] + ' (로그인됨)');
    } else {
      check('Higgsfield CLI', 'recommended', 'unauth', '설치됨, 로그인 필요');
      result.nextActions.push({
        target: 'higgsfield-auth',
        message: 'Higgsfield 에 로그인해주세요 (사장님 Plus 구독 계정).',
        command: 'higgsfield auth login',
      });
    }
  } else {
    check('Higgsfield CLI', 'recommended', 'missing', '`higgsfield` 명령 없음 — 이미지/영상 생성 기능 사용 시 필요');
    result.nextActions.push({
      target: 'higgsfield-install',
      message: 'Higgsfield CLI 를 설치하고 로그인해주세요 (이미지/영상 생성 기능 사용 시).',
      command: 'npm install -g @higgsfield-ai/cli && higgsfield auth login',
      link: 'https://higgsfield.ai',
    });
  }
}

// ── 5. GitHub CLI (권장) ──────────────────────────────
{
  const r = run('gh', ['--version'], { timeout: 8000 });
  if (r.ok) {
    const auth = run('gh', ['auth', 'status'], { timeout: 8000 });
    if (auth.ok) {
      check('GitHub CLI', 'recommended', 'ok', '인증됨');
    } else {
      check('GitHub CLI', 'recommended', 'unauth', '설치됨, 로그인 필요');
      result.nextActions.push({
        target: 'gh-auth',
        message: 'GitHub 에 로그인해주세요 (repo pull/push 용).',
        command: 'gh auth login',
      });
    }
  } else {
    check('GitHub CLI', 'recommended', 'missing', '`gh` 명령 없음 — git push/pull 은 git 자체 인증으로도 OK');
    result.nextActions.push({
      target: 'gh-install',
      message: '(선택) GitHub CLI 설치 시 push/pull 인증이 편해집니다.',
      command: null,
      link: 'https://cli.github.com/',
    });
  }
}

// ── 결과 요약 ─────────────────────────────────────────
if (!flags.json) {
  console.log('\n=================================================');
  console.log('  인증 점검 ' + (result.ok ? '완료 (필수 항목 OK)' : '미완료 (필수 항목 누락)'));
  console.log('=================================================');
  if (result.nextActions.length > 0) {
    console.log('\n조치 필요:');
    result.nextActions.forEach((a, i) => {
      console.log(`\n  ${i + 1}. ${a.message}`);
      if (a.command) console.log(`     → 사장님이 직접 실행: ${a.command}`);
      if (a.link) console.log(`     → 참고: ${a.link}`);
    });
    console.log('\n위 항목들을 직접 처리한 후 다시 "node scripts/check-auth.mjs" 로 점검해주세요.');
  } else {
    console.log('\n모든 항목이 정상입니다. code/ 에서 "node server.js" 로 서버를 시작하세요.');
  }
}

if (flags.json) console.log(JSON.stringify(result, null, 2));

// 권장/선택 항목은 result.ok 에 영향 안 줌 (필수만 영향)
process.exit(result.ok ? 0 : 1);
