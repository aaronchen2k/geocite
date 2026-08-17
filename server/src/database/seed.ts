import 'reflect-metadata';
import { type DeepPartial, type FindOptionsWhere, type ObjectLiteral, type Repository } from 'typeorm';
import { appDataSource } from './data-source';
import { BrandEntity } from '../modules/brands/brand.entity';
import { EngineEntity } from '../modules/engines/engine.entity';
import { DEFAULT_ENGINE_HOMEPAGES } from '../modules/engines/default-engine-homepages';
import { ModelEntity } from '../modules/models/model.entity';
import { RagAgentEntity } from '../modules/rag-agents/rag-agent.entity';
import { DiagnosisQuestionTaxonomyEntity } from '../modules/execution-diagnosis/question-taxonomy.entity';
import { DEFAULT_QUESTION_TAXONOMY, QUESTION_TAXONOMY_VERSION } from '../modules/execution-diagnosis/brand-question-prompt';
import { logLocal } from '../logging/local-time';

async function saveByUnique<T extends ObjectLiteral>(repository: Repository<T>, records: DeepPartial<T>[], unique: keyof T): Promise<void> {
  for (const record of records) {
    const uniqueValue = (record as Record<string, unknown>)[unique as string];
    const existing = await repository.findOne({ where: { [unique]: uniqueValue, deleted: false } as unknown as FindOptionsWhere<T> });
    await repository.save(existing ? repository.merge(existing, record) : repository.create(record));
  }
}

async function seed(): Promise<void> {
  await appDataSource.initialize();
  const brands = appDataSource.getRepository(BrandEntity);
  const engines = appDataSource.getRepository(EngineEntity);
  const models = appDataSource.getRepository(ModelEntity);
  const agents = appDataSource.getRepository(RagAgentEntity);
  const taxonomy = appDataSource.getRepository(DiagnosisQuestionTaxonomyEntity);

  await saveByUnique(taxonomy, DEFAULT_QUESTION_TAXONOMY.map((item) => ({ ...item, version: QUESTION_TAXONOMY_VERSION })), 'code');

  await saveByUnique(brands, [
    { code: 'aurora-beauty', name: '极光美妆', website: 'https://aurora.example.com', industry: '美妆个护', description: '面向年轻消费者的国货美妆品牌。', disabled: false },
    { code: 'peak-outdoor', name: '峰野户外', website: 'https://peak.example.com', industry: '运动户外', description: '专注轻量化徒步与露营装备。', disabled: false },
    { code: 'orbit-travel', name: '轨道旅行', website: 'https://orbit.example.com', industry: '在线旅游', description: '提供城市周边与主题旅行服务。', disabled: false },
    { code: 'harbor-coffee', name: '港湾咖啡', website: 'https://harbor.example.com', industry: '餐饮零售', description: '城市精品咖啡连锁。', disabled: true },
  ], 'code');

  await saveByUnique(engines, [
    { code: 'chatgpt', name: 'ChatGPT', vendor: 'OpenAI', homepage: DEFAULT_ENGINE_HOMEPAGES.chatgpt, description: '国际通用大模型问答渠道。', disabled: false },
    { code: 'deepseek', name: 'DeepSeek', vendor: 'DeepSeek', homepage: DEFAULT_ENGINE_HOMEPAGES.deepseek, description: '国产推理与通用问答渠道。', disabled: false },
    { code: 'doubao', name: '豆包', vendor: 'ByteDance', homepage: DEFAULT_ENGINE_HOMEPAGES.doubao, description: '字节跳动 AI 助手渠道。', disabled: false },
    { code: 'qwen', name: '千问', vendor: 'Alibaba', homepage: DEFAULT_ENGINE_HOMEPAGES.qwen, description: '阿里云 AI 助手渠道。', disabled: false },
    { code: 'yuanbao', name: '元宝', vendor: 'Tencent', homepage: DEFAULT_ENGINE_HOMEPAGES.yuanbao, description: '腾讯 AI 助手渠道。', disabled: false },
    { code: 'kimi', name: 'Kimi', vendor: 'Moonshot AI', homepage: DEFAULT_ENGINE_HOMEPAGES.kimi, description: '月之暗面 AI 助手渠道。', disabled: false },
    { code: 'wenxin-yiyan', name: '文心一言', vendor: 'Baidu', homepage: DEFAULT_ENGINE_HOMEPAGES['wenxin-yiyan'], description: '百度大模型 AI 助手渠道。', disabled: false },
    { code: 'wenxiaoyan', name: '文小言', vendor: 'Baidu', description: '百度 AI 助手渠道。', disabled: true },
  ], 'code');
  await engines.createQueryBuilder().update(EngineEntity).set({ ordr: () => 'id * 100' }).where('deleted = :deleted', { deleted: false }).execute();

  await saveByUnique(models, [
    { name: 'GPT-4.1 标准', modelName: 'gpt-4.1', provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'demo-openai-key', disabled: false, isDefault: true },
    { name: 'DeepSeek V3', modelName: 'deepseek-chat', provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: 'demo-deepseek-key', disabled: false, isDefault: false },
    { name: '豆包 Pro', modelName: 'doubao-pro-32k', provider: 'ByteDance', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: 'demo-doubao-key', disabled: false, isDefault: false },
    { name: '离线评测模型', modelName: 'evaluation-stub', provider: 'Internal', baseUrl: null, apiKey: null, disabled: true, isDefault: false },
  ], 'modelName');

  const [aurora, peak, orbit, harbor] = await Promise.all(['aurora-beauty', 'peak-outdoor', 'orbit-travel', 'harbor-coffee'].map((code) => brands.findOneByOrFail({ code, deleted: false })));
  const [gpt, deepseek, doubao, stub] = await Promise.all(['gpt-4.1', 'deepseek-chat', 'doubao-pro-32k', 'evaluation-stub'].map((modelName) => models.findOneByOrFail({ modelName, deleted: false })));

  await saveByUnique(agents, [
    { code: 'aurora-advisor', name: '极光选品顾问', brandId: aurora.id, modelId: gpt.id, description: '回答护肤功效、成分与搭配建议。', systemPrompt: '你是极光美妆的专业选品顾问，回答须基于品牌公开资料。', disabled: false },
    { code: 'aurora-content', name: '极光内容助手', brandId: aurora.id, modelId: deepseek.id, description: '生成成分科普与社媒内容初稿。', systemPrompt: '你负责输出清晰、合规的美妆内容草稿。', disabled: false },
    { code: 'peak-gear', name: '峰野装备向导', brandId: peak.id, modelId: gpt.id, description: '按场景推荐徒步和露营装备。', systemPrompt: '你是经验丰富的户外装备顾问。', disabled: false },
    { code: 'peak-route', name: '峰野路线助手', brandId: peak.id, modelId: doubao.id, description: '辅助规划周末徒步路线。', systemPrompt: '你需要优先提示天气、安全与补给风险。', disabled: false },
    { code: 'orbit-planner', name: '轨道行程规划师', brandId: orbit.id, modelId: deepseek.id, description: '整合目的地攻略与行程建议。', systemPrompt: '你是可执行的旅行规划师。', disabled: false },
    { code: 'harbor-legacy', name: '港湾旧版客服', brandId: harbor.id, modelId: stub.id, description: '用于演示禁用的历史智能体。', systemPrompt: '该智能体已下线。', disabled: true },
  ], 'code');

  const [brandCount, engineCount, modelCount, agentCount] = await Promise.all([brands.countBy({ deleted: false }), engines.countBy({ deleted: false }), models.countBy({ deleted: false }), agents.countBy({ deleted: false })]);
  logLocal(`Seeded ${brandCount} Brands, ${engineCount} Engines, ${modelCount} Models, and ${agentCount} RagAgents.`);
}

void seed().finally(async () => {
  if (appDataSource.isInitialized) await appDataSource.destroy();
});
