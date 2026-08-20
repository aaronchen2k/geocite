import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSearchPrompt } from './crawl.mts';

test('DeepSeek 输入保留联网引用要求，并仅附加纯问题', () => {
  assert.equal(
    buildSearchPrompt('哪个智能手表好看？'),
    '请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n问题：哪个智能手表好看？',
  );
});
