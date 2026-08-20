import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRunConfig } from './domain.mts';
import type { EngineConfig } from './load-config.mts';

test('显式问题覆盖默认 query，且不把默认 batchQueries 写入本次运行快照', () => {
  const config = {
    engine: 'deepseek',
    cdpUrl: 'http://127.0.0.1:9222',
    targetUrl: 'https://chat.deepseek.com/',
    query: '配置中的旧问题',
    batchQueries: ['配置中的旧批量问题'],
    responseWaitMs: 30_000,
    waitJitterMs: [0, 0],
  } as EngineConfig;

  const snapshot = makeRunConfig('sampling-debug', config, ['请用一句话介绍北京。', '请用一句话介绍上海。']);

  assert.equal(snapshot.config.query, '请用一句话介绍北京。');
  assert.equal('batchQueries' in snapshot.config, false);
});
