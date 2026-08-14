import { runExecutionDiagnosisSimulation } from './simulate-execution-diagnosis';

describe('执行诊断模拟脚本', () => {
  it('采集页面、UA 探测和 AI 采样结果并写入数据库', async () => {
    await expect(runExecutionDiagnosisSimulation()).resolves.toEqual({
      pages: 4,
      probes: 4,
      samples: 1,
    });
  }, 20_000);
});
