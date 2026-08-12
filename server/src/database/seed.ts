import 'reflect-metadata';
import { type DeepPartial, type FindOptionsWhere, type ObjectLiteral, type Repository } from 'typeorm';
import { appDataSource } from './data-source';
import { BrandEntity } from '../modules/brands/brand.entity';
import { EngineEntity } from '../modules/engines/engine.entity';
import { ModelEntity } from '../modules/models/model.entity';
import { RagAgentEntity } from '../modules/rag-agents/rag-agent.entity';

async function saveByUnique<T extends ObjectLiteral>(repository: Repository<T>, records: DeepPartial<T>[], unique: keyof T): Promise<void> {
  for (const record of records) {
    const uniqueValue = (record as Record<string, unknown>)[unique as string];
    const existing = await repository.findOne({ where: { [unique]: uniqueValue } as FindOptionsWhere<T> });
    await repository.save(existing ? repository.merge(existing, record) : repository.create(record));
  }
}

async function seed(): Promise<void> {
  await appDataSource.initialize();
  const brands = appDataSource.getRepository(BrandEntity);
  const engines = appDataSource.getRepository(EngineEntity);
  const models = appDataSource.getRepository(ModelEntity);
  const agents = appDataSource.getRepository(RagAgentEntity);

  await saveByUnique(brands, [
    { code: 'aurora-beauty', name: '极光美妆', website: 'https://aurora.example.com', industry: '美妆个护', description: '面向年轻消费者的国货美妆品牌。', enabled: true },
    { code: 'peak-outdoor', name: '峰野户外', website: 'https://peak.example.com', industry: '运动户外', description: '专注轻量化徒步与露营装备。', enabled: true },
    { code: 'orbit-travel', name: '轨道旅行', website: 'https://orbit.example.com', industry: '在线旅游', description: '提供城市周边与主题旅行服务。', enabled: true },
    { code: 'harbor-coffee', name: '港湾咖啡', website: 'https://harbor.example.com', industry: '餐饮零售', description: '城市精品咖啡连锁。', enabled: false },
  ], 'code');

  await saveByUnique(engines, [
    { code: 'chatgpt', name: 'ChatGPT', vendor: 'OpenAI', description: '国际通用大模型问答渠道。', enabled: true },
    { code: 'deepseek', name: 'DeepSeek', vendor: 'DeepSeek', description: '国产推理与通用问答渠道。', enabled: true },
    { code: 'doubao', name: '豆包', vendor: 'ByteDance', description: '字节跳动 AI 助手渠道。', enabled: true },
    { code: 'yuanbao', name: '元宝', vendor: 'Tencent', description: '腾讯 AI 助手渠道。', enabled: true },
    { code: 'kimi', name: 'Kimi', vendor: 'Moonshot AI', description: '月之暗面 AI 助手渠道。', enabled: true },
    { code: 'wenxin-yiyan', name: '文心一言', vendor: 'Baidu', description: '百度大模型 AI 助手渠道。', enabled: true },
    { code: 'wenxiaoyan', name: '文小言', vendor: 'Baidu', description: '百度 AI 助手渠道。', enabled: false },
  ], 'code');
  await engines.createQueryBuilder().update(EngineEntity).set({ ordr: () => 'id * 100' }).execute();

  await saveByUnique(models, [
    { name: 'GPT-4.1 标准', modelName: 'gpt-4.1', provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'demo-openai-key', enabled: true, isDefault: true },
    { name: 'DeepSeek V3', modelName: 'deepseek-chat', provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: 'demo-deepseek-key', enabled: true, isDefault: false },
    { name: '豆包 Pro', modelName: 'doubao-pro-32k', provider: 'ByteDance', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: 'demo-doubao-key', enabled: true, isDefault: false },
    { name: '离线评测模型', modelName: 'evaluation-stub', provider: 'Internal', baseUrl: null, apiKey: null, enabled: false, isDefault: false },
  ], 'modelName');

  const [aurora, peak, orbit, harbor] = await Promise.all(['aurora-beauty', 'peak-outdoor', 'orbit-travel', 'harbor-coffee'].map((code) => brands.findOneByOrFail({ code })));
  const [gpt, deepseek, doubao, stub] = await Promise.all(['gpt-4.1', 'deepseek-chat', 'doubao-pro-32k', 'evaluation-stub'].map((modelName) => models.findOneByOrFail({ modelName })));

  await saveByUnique(agents, [
    { code: 'aurora-advisor', name: '极光选品顾问', brandId: aurora.id, modelId: gpt.id, description: '回答护肤功效、成分与搭配建议。', systemPrompt: '你是极光美妆的专业选品顾问，回答须基于品牌公开资料。', enabled: true },
    { code: 'aurora-content', name: '极光内容助手', brandId: aurora.id, modelId: deepseek.id, description: '生成成分科普与社媒内容初稿。', systemPrompt: '你负责输出清晰、合规的美妆内容草稿。', enabled: true },
    { code: 'peak-gear', name: '峰野装备向导', brandId: peak.id, modelId: gpt.id, description: '按场景推荐徒步和露营装备。', systemPrompt: '你是经验丰富的户外装备顾问。', enabled: true },
    { code: 'peak-route', name: '峰野路线助手', brandId: peak.id, modelId: doubao.id, description: '辅助规划周末徒步路线。', systemPrompt: '你需要优先提示天气、安全与补给风险。', enabled: true },
    { code: 'orbit-planner', name: '轨道行程规划师', brandId: orbit.id, modelId: deepseek.id, description: '整合目的地攻略与行程建议。', systemPrompt: '你是可执行的旅行规划专家。', enabled: true },
    { code: 'harbor-legacy', name: '港湾旧版客服', brandId: harbor.id, modelId: stub.id, description: '用于演示禁用的历史智能体。', systemPrompt: '该智能体已下线。', enabled: false },
  ], 'code');

  const [brandCount, engineCount, modelCount, agentCount] = await Promise.all([brands.count(), engines.count(), models.count(), agents.count()]);
  console.log(`Seeded ${brandCount} Brands, ${engineCount} Engines, ${modelCount} Models, and ${agentCount} RagAgents.`);
}

void seed().finally(async () => {
  if (appDataSource.isInitialized) await appDataSource.destroy();
});
