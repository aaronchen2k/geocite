import { normalizeDiagnosisQuestions } from './brand-diagnosis-config';

describe('品牌诊断问题', () => {
  it('保留问题顺序并移除空白项与重复项', () => {
    expect(normalizeDiagnosisQuestions([' 问题一 ', '', '问题二', '问题一'])).toEqual(['问题一', '问题二']);
  });
});
