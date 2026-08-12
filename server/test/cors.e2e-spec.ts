import {INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {AppModule} from '../src/app.module';
import {corsOptions} from '../src/config/cors';

describe('CORS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({imports: [AppModule]}).compile();
    app = moduleRef.createNestApplication();
    app.enableCors(corsOptions);
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app.close());

  it('allows the localhost UI development origin', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/brands')
      .set('Origin', 'http://localhost:8000')
      .expect('access-control-allow-origin', 'http://localhost:8000')
      .expect(200);
  });
});
