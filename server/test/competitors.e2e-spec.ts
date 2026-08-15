import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Competitors', () => {
  let app: INestApplication;
  let brandId: number;
  beforeAll(async () => { const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = moduleRef.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init(); brandId = (await request(app.getHttpServer()).post('/api/v1/brands').send({name: '测试品牌', code: 'test-brand'})).body.id; });
  afterAll(async () => { await app.close(); });
  it('keeps disabled competitors with normalized aliases', async () => {
    const created = await request(app.getHttpServer()).post(`/api/v1/brands/${brandId}/competitors`).send({name: '腾讯文档', aliases: ['腾讯 Docs', 'Tencent Docs', '腾讯 Docs'], market: 'CN'}).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/brands/${brandId}/competitors/${created.body.id}`).send({enabled: false}).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/brands/${brandId}/competitors`).expect(200).expect(({body}) => expect(body.items[0]).toMatchObject({name: '腾讯文档', aliases: ['腾讯 Docs', 'Tencent Docs'], market: 'CN', enabled: false}));
  });
});
