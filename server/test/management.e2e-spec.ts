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
      .send({ name: '豆包', code: 'doubao', vendor: 'ByteDance' })
      .expect(201);
    const model = await request(app.getHttpServer())
      .post('/api/v1/models')
      .send({ name: '分析模型', modelName: 'gpt-5', provider: 'OpenAI', apiKey: 'sk-secret-value' })
      .expect(201);

    expect(engine.body).toMatchObject({ name: '豆包', code: 'doubao', vendor: 'ByteDance', enabled: true });
    expect(engine.body).not.toHaveProperty('modelId');
    expect(model.body).toMatchObject({ name: '分析模型', apiKeyConfigured: true, apiKeyMasked: 'sk-…alue' });
    expect(JSON.stringify(model.body)).not.toContain('sk-secret-value');
  });

  it('creates RagAgents only for existing Brands and enabled Models', async () => {
    const brand = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .send({ name: '星云', code: 'nebula' })
      .expect(201);
    const disabledModel = await request(app.getHttpServer())
      .post('/api/v1/models')
      .send({ name: '禁用模型', modelName: 'gpt-disabled', provider: 'OpenAI', enabled: false })
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
});
