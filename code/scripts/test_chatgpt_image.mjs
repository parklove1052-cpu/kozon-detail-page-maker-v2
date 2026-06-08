/**
 * test_chatgpt_image.mjs
 * Standalone test for chatgpt-image.mjs
 *
 * Run from domain root:
 *   node code/scripts/test_chatgpt_image.mjs
 *
 * First run: browser opens, log in to ChatGPT Plus.
 * Subsequent runs reuse the saved profile (no login needed).
 */

import { generateImage } from '../lib/chatgpt-image.mjs';

const TEST_PROMPT = 'A single bright red apple on a clean white studio background, sharp product photography, 8k';

console.log('=== ChatGPT Image Generation Test ===');
console.log('Prompt:', TEST_PROMPT);
console.log('');

try {
  const result = await generateImage({ prompt: TEST_PROMPT, count: 1 });
  if (result.ok) {
    console.log('');
    console.log('SUCCESS!');
    console.log('Files:', result.files);
    console.log('Elapsed:', result.elapsed_ms + 'ms');
  } else {
    console.error('FAILED (ok=false)', result);
    process.exit(1);
  }
} catch (err) {
  console.error('');
  console.error('ERROR:', err.message);
  console.error('');
  if (err.message.includes('INPUT_SELECTORS') || err.message.includes('IMG_SELECTORS')) {
    console.error('--- ChatGPT DOM may have changed. ---');
    console.error('Update selectors in: code/lib/chatgpt-image.mjs');
  }
  process.exit(1);
}
