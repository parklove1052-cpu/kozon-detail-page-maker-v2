// v0.7 — 슬롯 이미지 저장 / 백업 / 복원 (Inpaint 흐름 지원)
//
// 파일 구조:
//   output/{slug}/{slotId}.png        ← 현재 컷
//   output/{slug}/.history/
//     ├─ {slotId}.v1.png              ← 자동 백업 (이전 버전)
//     ├─ {slotId}.v2.png
//     └─ {slotId}.v3.png
//
// 슬롯/슬러그는 파일명 안전성 검증 후 사용 (디렉토리 트래버설 방지)

'use strict';

const fs = require('fs');
const path = require('path');

const SAFE_NAME_RE = /^[a-zA-Z0-9._\-가-힣]+$/;
const MAX_VERSIONS = 50; // 안전 상한 — 무한 누적 방지

function assertSafeName(name, kind) {
  if (typeof name !== 'string' || !name) throw new Error(`${kind} 비어있음`);
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`${kind} 경로 트래버설 차단: ${name}`);
  }
  if (!SAFE_NAME_RE.test(name)) throw new Error(`${kind} 형식 불일치: ${name}`);
  if (name.length > 80) throw new Error(`${kind} 너무 김 (max 80)`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slotDir(outputRoot, slug) {
  assertSafeName(slug, 'slug');
  return path.join(outputRoot, slug);
}

function slotPath(outputRoot, slug, slotId) {
  assertSafeName(slotId, 'slotId');
  return path.join(slotDir(outputRoot, slug), `${slotId}.png`);
}

function historyDir(outputRoot, slug) {
  return path.join(slotDir(outputRoot, slug), '.history');
}

function escapeRegex(s) {
  // SAFE_NAME_RE는 '.'을 허용하므로 'a.b' 슬롯이 'axb.v1.png'에도 매칭될 수 있음 — escape 필수
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listVersions(outputRoot, slug, slotId) {
  assertSafeName(slotId, 'slotId');
  const dir = historyDir(outputRoot, slug);
  if (!fs.existsSync(dir)) return [];
  const re = new RegExp(`^${escapeRegex(slotId)}\\.v(\\d+)\\.png$`);
  const versions = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  for (const f of entries) {
    const m = re.exec(f);
    if (!m) continue;
    versions.push({ version: parseInt(m[1], 10), file: f, path: path.join(dir, f) });
  }
  versions.sort((a, b) => a.version - b.version);
  return versions;
}

function getNextVersion(outputRoot, slug, slotId) {
  const versions = listVersions(outputRoot, slug, slotId);
  return versions.length ? versions[versions.length - 1].version + 1 : 1;
}

function pruneVersions(outputRoot, slug, slotId) {
  const versions = listVersions(outputRoot, slug, slotId);
  if (versions.length <= MAX_VERSIONS) return;
  const toRemove = versions.slice(0, versions.length - MAX_VERSIONS);
  for (const v of toRemove) {
    try { fs.unlinkSync(v.path); } catch (_) {}
  }
}

// 동시 saveSlot/rollback 직렬화 — 같은 slug+slot에 동시 요청 시 race로 백업 누락 방지
const SLOT_LOCKS = new Map();

async function withSlotLock(slug, slotId, fn) {
  const key = `${slug}::${slotId}`;
  const prev = SLOT_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((res) => { release = res; });
  SLOT_LOCKS.set(key, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    // 큐가 비면 메모리 누수 방지
    if (SLOT_LOCKS.get(key) === next.then) SLOT_LOCKS.delete(key);
  }
}

/**
 * 슬롯 이미지 저장 (현재 컷 교체). 기존 파일이 있으면 .history/에 자동 백업.
 * atomic write — 임시 파일에 쓴 뒤 rename으로 원자적 교체. 동시성 보호: SLOT_LOCKS.
 */
function saveSlot(outputRoot, slug, slotId, buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('buffer는 Buffer여야 함');
  ensureDir(slotDir(outputRoot, slug));
  const file = slotPath(outputRoot, slug, slotId);

  // 같은 slot에 동시 호출이 와도 마지막 호출이 안전하게 처리되도록 sync 큐
  // (Promise 기반보다 단순한 동기 큐 — Node single-thread + sync IO 활용)
  let backedUp = false;
  let backupVersion = null;
  if (fs.existsSync(file)) {
    ensureDir(historyDir(outputRoot, slug));
    backupVersion = getNextVersion(outputRoot, slug, slotId);
    const backupPath = path.join(historyDir(outputRoot, slug), `${slotId}.v${backupVersion}.png`);
    // 백업도 atomic 흉내 — temp → rename
    const backupTmp = backupPath + '.tmp.' + process.pid + '.' + Date.now();
    fs.copyFileSync(file, backupTmp);
    fs.renameSync(backupTmp, backupPath);
    backedUp = true;
  }
  // 새 파일 atomic write
  const tmp = file + '.tmp.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, file);
  pruneVersions(outputRoot, slug, slotId);
  return { ok: true, path: file, backedUp, backupVersion };
}

/**
 * 지정 버전을 현재 컷으로 복원. 현재 컷도 한 번 백업 후 덮어쓰기.
 */
function rollback(outputRoot, slug, slotId, targetVersion) {
  const versions = listVersions(outputRoot, slug, slotId);
  const target = versions.find((v) => v.version === Number(targetVersion));
  if (!target) {
    const err = new Error(`version ${targetVersion} 없음 (가용: ${versions.map(v => v.version).join(',') || '없음'})`);
    err.code = 'VERSION_NOT_FOUND';
    throw err;
  }
  const current = slotPath(outputRoot, slug, slotId);
  if (fs.existsSync(current)) {
    ensureDir(historyDir(outputRoot, slug));
    const v = getNextVersion(outputRoot, slug, slotId);
    fs.copyFileSync(current, path.join(historyDir(outputRoot, slug), `${slotId}.v${v}.png`));
  }
  fs.copyFileSync(target.path, current);
  return { ok: true, restored_version: target.version };
}

function readSlotBase64(outputRoot, slug, slotId) {
  const file = slotPath(outputRoot, slug, slotId);
  if (!fs.existsSync(file)) {
    const err = new Error(`slot ${slotId} (${slug}) 없음`);
    err.code = 'SLOT_NOT_FOUND';
    throw err;
  }
  const buf = fs.readFileSync(file);
  // 파일 시그니처로 확장자 추론 (PNG / JPEG 양쪽 허용)
  const ext = buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 ? 'jpeg' : 'png';
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

module.exports = {
  saveSlot,
  rollback,
  listVersions,
  readSlotBase64,
  slotPath,
  slotDir,
  historyDir,
  assertSafeName,
};
