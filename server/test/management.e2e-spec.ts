import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('system management APIs', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app.close());

  it('manages independent Engines and masks Model API keys', async () => {
    const engine = await request(app.getHttpServer())
      .post('/api/v1/engines')
      .send({ name: '豆包', code: 'doubao', vendor: 'ByteDance', homepage: 'https://www.doubao.com' })
      .expect(201);
    const model = await request(app.getHttpServer())
      .post('/api/v1/models')
      .send({ name: '分析模型', modelName: 'gpt-5', provider: 'OpenAI', apiKey: 'sk-secret-value' })
      .expect(201);

    expect(engine.body).toMatchObject({ name: '豆包', code: 'doubao', vendor: 'ByteDance', homepage: 'https://www.doubao.com', disabled: false });
    expect(engine.body).not.toHaveProperty('modelId');
    expect(model.body).toMatchObject({ name: '分析模型', apiKeyConfigured: true, apiKeyMasked: 'sk-…alue' });
    expect(JSON.stringify(model.body)).not.toContain('sk-secret-value');
  });

  it('updates an Engine web review configuration without resubmitting its identity fields', async () => {
    const engine = await request(app.getHttpServer())
      .post('/api/v1/engines')
      .send({ name: '局部更新引擎', code: 'partial-update-engine', vendor: 'Test' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/engines/${engine.body.id}`)
      .send({ webReviewConfig: {
        chatUrl: 'https://www.qianwen.com/',
        inputSelector: 'div[role="textbox"]',
        answerSelector: '#qk-markdown-react',
        citationSelector: 'a[href]',
        sourceTriggerText: '来源',
      } })
      .expect(200);

    expect(response.body.webReviewConfig).toMatchObject({ sourceTriggerText: '来源' });

    const saved = await request(app.getHttpServer())
      .get(`/api/v1/engines/${engine.body.id}`)
      .expect(200);
    expect(saved.body).toMatchObject({
      name: '局部更新引擎',
      code: 'partial-update-engine',
      webReviewConfig: expect.objectContaining({ sourceTriggerText: '来源' }),
    });
  });

  it('creates RagAgents only for existing Brands and non-disabled Models', async () => {
    const brand = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .send({ name: '星云', code: 'nebula' })
      .expect(201);
    const disabledModel = await request(app.getHttpServer())
      .post('/api/v1/models')
      .send({ name: '禁用模型', modelName: 'gpt-disabled', provider: 'OpenAI', disabled: true })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/rag-agents')
      .send({ name: '助手', code: 'bad-agent', brandId: 999, modelId: 999 })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/rag-agents')
      .send({ name: '助手', code: 'disabled-agent', brandId: brand.body.id, modelId: disabledModel.body.id })
      .expect(400);
  });

  it('filters, sorts, and paginates Engine lists with a page envelope', async () => {
    await request(app.getHttpServer()).post('/api/v1/engines').send({ name: '排序引擎 A', code: 'sort-a', vendor: 'OpenAI' }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/engines').send({ name: '排序引擎 B', code: 'sort-b', vendor: 'OpenAI' }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/engines').send({ name: '其他引擎', code: 'sort-c', vendor: 'Other' }).expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/engines?page=1&pageSize=1&vendor=OpenAI&disabled=false&sortBy=name&sortOrder=DESC')
      .expect(200);

    expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ name: '排序引擎 B', vendor: 'OpenAI' });
  });

  it('assigns Engine ordr from its id and lists Engines by id by default', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/engines')
      .send({ name: '默认排序 A', code: 'default-order-a', vendor: 'Order Test' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/engines')
      .send({ name: '默认排序 B', code: 'default-order-b', vendor: 'Order Test' })
      .expect(201);

    expect(first.body.ordr).toBe(first.body.id * 100);
    expect(second.body.ordr).toBe(second.body.id * 100);

    const response = await request(app.getHttpServer()).get('/api/v1/engines?vendor=Order%20Test').expect(200);
    expect(response.body.items.map((item: { id: number }) => item.id)).toEqual([first.body.id, second.body.id]);
  });

  it('soft deletes every management resource and exposes UTC audit fields', async () => {
    const brand = await request(app.getHttpServer()).post('/api/v1/brands').send({ name: '软删除品牌', code: 'soft-brand', disabled: false }).expect(201);
    const engine = await request(app.getHttpServer()).post('/api/v1/engines').send({ name: '软删除引擎', code: 'soft-engine', vendor: 'Test', disabled: false }).expect(201);
    const model = await request(app.getHttpServer()).post('/api/v1/models').send({ name: '软删除模型', modelName: 'soft-model', provider: 'Test', disabled: false }).expect(201);
    const agent = await request(app.getHttpServer()).post('/api/v1/rag-agents').send({ name: '软删除智能体', code: 'soft-agent', brandId: brand.body.id, modelId: model.body.id, disabled: false }).expect(201);

    for (const item of [brand.body, engine.body, model.body, agent.body]) {
      expect(item).toMatchObject({ disabled: false, deleted: false });
      expect(item.createdAt).toEqual(expect.any(String));
      expect(item.updatedAt).toEqual(expect.any(String));
      expect(item.deletedAt).toBeNull();
    }

    await request(app.getHttpServer()).delete(`/api/v1/engines/${engine.body.id}`).expect({ deleted: true, id: engine.body.id });
    await request(app.getHttpServer()).get(`/api/v1/engines/${engine.body.id}`).expect(404);
    await request(app.getHttpServer()).get('/api/v1/engines?keyword=软删除引擎').expect(({ body }) => expect(body.items).toHaveLength(0));

    await request(app.getHttpServer()).delete(`/api/v1/rag-agents/${agent.body.id}`).expect({ deleted: true, id: agent.body.id });
    await request(app.getHttpServer()).get(`/api/v1/rag-agents/${agent.body.id}`).expect(400);
    await request(app.getHttpServer()).delete(`/api/v1/models/${model.body.id}`).expect({ deleted: true, id: model.body.id });
    await request(app.getHttpServer()).delete(`/api/v1/brands/${brand.body.id}`).expect({ deleted: true, id: brand.body.id });
  });
});
