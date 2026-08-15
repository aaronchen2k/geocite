import http, { type Server } from 'node:http';
import 'reflect-metadata';

type SimulationResult = { pages: number; probes: number; samples: number };

function startSimulationSite(): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((request, response) => {
    const url = request.url ?? '/';
    const send = (status: number, body: string, contentType: string) => {
      response.writeHead(status, { 'content-type': contentType });
      response.end(body);
    };
    if (request.method === 'POST' && url === '/openai/v1/chat/completions') {
      send(200, JSON.stringify({ choices: [{ message: { content: 'GeoCite 模拟引擎已采集到品牌站点信息。' } }] }), 'application/json');
      return;
    }
    if (url === '/') return send(200, '<!doctype html><html><head><title>模拟品牌</title><link rel="canonical" href="/" /><script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>模拟品牌</h1><p>用于执行诊断脚本的本地页面。</p></body></html>', 'text/html');
    if (url === '/robots.txt') return send(200, 'User-agent: *\nAllow: /\n', 'text/plain');
    if (url === '/sitemap.xml') return send(200, `<?xml version="1.0"?><urlset><url><loc>http://${request.headers.host}/article</loc></url></urlset>`, 'application/xml');
    if (url === '/article') return send(200, '<!doctype html><html><body><h1>模拟文章</h1><p>这是一篇可供分析的页面内容。</p></body></html>', 'text/html');
    send(404, 'not found', 'text/plain');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('无法获取模拟站点端口'));
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function waitForTerminalRun(service: { findOne(id: number): Promise<{ status: string }> }, id: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const run = await service.findOne(id);
    if (['succeeded', 'failed', 'partial', 'cancelled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('模拟执行诊断超时');
}

export async function runExecutionDiagnosisSimulation(): Promise<SimulationResult> {
  process.env.NODE_ENV = 'test';
  const { server, baseUrl } = await startSimulationSite();
  const [{ appDataSource }, { BrandEntity }, { BrandEngineEntity }, { EngineEntity }, { BrandDiagnosisQuestionEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisSampleEntity }, { ExecutionDiagnosisService }, { flushLoggers }] = await Promise.all([
    import('../database/data-source'),
    import('../modules/brands/brand.entity'),
    import('../modules/brands/brand-engine.entity'),
    import('../modules/engines/engine.entity'),
    import('../modules/execution-diagnosis/execution-diagnosis.entity'),
    import('../modules/execution-diagnosis/execution-diagnosis.service'),
    import('../logging/pino-logger'),
  ]);
  try {
    await appDataSource.initialize();
    const brands = appDataSource.getRepository(BrandEntity);
    const brandEngines = appDataSource.getRepository(BrandEngineEntity);
    const engines = appDataSource.getRepository(EngineEntity);
    const runs = appDataSource.getRepository(ExecutionDiagnosisRunEntity);
    const steps = appDataSource.getRepository(ExecutionDiagnosisStepEntity);
    const events = appDataSource.getRepository(ExecutionDiagnosisEventEntity);
    const pages = appDataSource.getRepository(ExecutionDiagnosisPageEntity);
    const probes = appDataSource.getRepository(ExecutionDiagnosisProbeEntity);
    const samples = appDataSource.getRepository(ExecutionDiagnosisSampleEntity);
    const diagnosisQuestions = appDataSource.getRepository(BrandDiagnosisQuestionEntity);
    const suffix = Date.now().toString(36);
    const brand = await brands.save(brands.create({ code: `diagnosis-simulation-${suffix}`, name: '执行诊断模拟品牌', website: baseUrl, industry: null, description: null, questions: null, questionsPrompt: null, isDefault: false, disabled: false, deleted: false, deletedAt: null }));
    await diagnosisQuestions.save(diagnosisQuestions.create({ brandId: brand.id, question: '模拟品牌提供什么服务？', group: '推荐', market: 'cn', brandProbe: false, ordr: 0 }));
    const engine = await engines.save(engines.create({ code: `simulation-${suffix}`, name: '模拟问答引擎', vendor: 'GeoCite', description: null, modelName: 'simulation-model', baseUrl: `${baseUrl}/openai/v1`, apiKey: 'simulation-key', disabled: false, ordr: 1, deleted: false, deletedAt: null }));
    await brandEngines.save(brandEngines.create({ brandId: brand.id, engineId: engine.id }));
    const service = new ExecutionDiagnosisService(brands, brandEngines, engines, runs, steps, events, pages, probes, samples, diagnosisQuestions);
    const createdRun = await service.create(brand.id);
    const completedRun = await waitForTerminalRun(service, createdRun.id);
    if (completedRun.status !== 'succeeded') throw new Error(`模拟执行诊断未成功完成：${completedRun.status}`);
    const [pageCount, probeCount, sampleRecords] = await Promise.all([
      pages.count({ where: { runId: createdRun.id } }),
      probes.count({ where: { runId: createdRun.id } }),
      samples.find({ where: { runId: createdRun.id } }),
    ]);
    if (pageCount !== 4 || probeCount !== 4 || sampleRecords.length !== 1 || !sampleRecords[0].answer.includes('模拟引擎')) {
      throw new Error(`模拟采集记录不完整：pages=${pageCount}, probes=${probeCount}, samples=${sampleRecords.length}`);
    }
    return { pages: pageCount, probes: probeCount, samples: sampleRecords.length };
  } finally {
    if (appDataSource.isInitialized) await appDataSource.destroy();
    await closeServer(server);
    await flushLoggers();
  }
}

if (require.main === module) {
  void runExecutionDiagnosisSimulation().then((result) => {
    console.log(`模拟执行诊断完成：页面 ${result.pages} 条，UA 探测 ${result.probes} 条，AI 采样 ${result.samples} 条。`);
  }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
