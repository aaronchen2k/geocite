import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Brands', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets exactly one default brand and rejects deletion of it', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .send({ name: '星云', code: 'nebula' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .send({ name: '北斗', code: 'beidou' })
      .expect(201);

    await request(app.getHttpServer()).patch(`/api/v1/brands/${second.body.id}/default`).expect(200);
    await request(app.getHttpServer()).delete(`/api/v1/brands/${second.body.id}`).expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/brands')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.find((item: { id: number }) => item.id === second.body.id).isDefault).toBe(true),
      );

    expect(first.body.code).toBe('nebula');
  });

  it('creates, updates, filters, paginates, and rejects duplicate brand codes', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .send({
        name: '极光',
        code: 'aurora',
        website: 'https://aurora.example.com',
        industry: 'SaaS',
        description: 'GEO platform',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      id: expect.any(Number),
      name: '极光',
      code: 'aurora',
      website: 'https://aurora.example.com',
      industry: 'SaaS',
      description: 'GEO platform',
      isDefault: false,
      disabled: false,
    });
    expect(created.body.createdAt).toEqual(expect.any(String));
    expect(created.body.updatedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .patch(`/api/v1/brands/${created.body.id}`)
      .send({ name: '极光智能', disabled: true })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ name: '极光智能', disabled: true }));

    await request(app.getHttpServer())
      .post('/api/v1/brands')
      .send({ name: '重复', code: 'aurora' })
      .expect(409);

    await request(app.getHttpServer())
      .get('/api/v1/brands?keyword=极光&page=1&pageSize=1')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
        expect(body.items).toHaveLength(1);
        expect(body.items[0]).toMatchObject({ id: created.body.id, code: 'aurora', name: '极光智能' });
      });

    await request(app.getHttpServer())
      .get(`/api/v1/brands/${created.body.id}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: created.body.id, code: 'aurora', name: '极光智能', disabled: true }),
      );

    await request(app.getHttpServer()).delete(`/api/v1/brands/${created.body.id}`).expect(200).expect({
      deleted: true,
      id: created.body.id,
    });
    await request(app.getHttpServer()).get(`/api/v1/brands/${created.body.id}`).expect(404);
  });
});
