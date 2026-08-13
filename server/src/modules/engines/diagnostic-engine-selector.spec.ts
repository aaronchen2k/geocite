import { selectDiagnosticEngines } from './diagnostic-engine-selector';

describe('selectDiagnosticEngines', () => {
  it('只选择已关联、启用且配置 API Key 的引擎用于自动采样', () => {
    const result = selectDiagnosticEngines([
      { id: 1, code: 'qwen', disabled: false, apiKey: 'secret' },
      { id: 2, code: 'doubao', disabled: false, apiKey: null },
      { id: 3, code: 'kimi', disabled: true, apiKey: 'secret' },
    ]);

    expect(result.eligible.map((engine) => engine.code)).toEqual(['qwen']);
    expect(result.skipped).toEqual([
      { id: 2, code: 'doubao', reason: 'api-key-not-configured' },
      { id: 3, code: 'kimi', reason: 'engine-disabled' },
    ]);
  });
});
