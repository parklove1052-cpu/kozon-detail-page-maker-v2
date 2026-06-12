/**
 * test_chatgpt_4parallel.mjs
 * PoC v2 — "프로젝트(조)" 안에서 4개 탭 병렬 이미지 생성 + 지정 폴더 자동 이동
 *
 * Run from domain root:
 *   node code/scripts/test_chatgpt_4parallel.mjs
 *
 * Result: code/generated/parallel_<ts>/01_<ts>.png ~ 04_<ts>.png
 */

import { generateImagesInProjectParallel } from '../lib/chatgpt-image.mjs';

const PROJECT_NAME = '프로젝트(조)';
const PROMPTS = [
  'A single bright red apple on a clean white studio background, sharp product photography, 8k',
  'A golden delicious apple, side view, soft natural daylight, minimalist composition',
  'A sliced apple showing the cross-section, juicy texture, macro shot',
  'An apple orchard at sunset, lifestyle scene, warm cinematic tones',
];

console.log('=== ChatGPT Project Parallel Test ===');
console.log('Project:', PROJECT_NAME);
console.log('Prompts:', PROMPTS.length);
console.log('');

try {
  const result = await generateImagesInProjectParallel({
    projectName: PROJECT_NAME,
    prompts: PROMPTS,
    staggerMs: 5000,           // 5초 간격 — 부하 분산
    perTabTimeoutMs: 360000,   // 6분 — "조" reasoning 모드 대응
  });

  console.log('');
  console.log(result.ok ? '✅ FULL SUCCESS!' : '⚠ PARTIAL: ' + result.files.length + '/' + PROMPTS.length);
  console.log('Project URL:', result.projectUrl);
  console.log('Output dir :', result.outputDir);
  console.log('Files      :', result.files);
  if (result.failures.length) console.log('Failures   :', result.failures);
  console.log('Elapsed    :', result.elapsed_ms + 'ms');

  process.exit(result.ok ? 0 : 1);
} catch (err) {
  console.error('');
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}
