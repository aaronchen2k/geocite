import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

it('GET /api/v1/health returns ok', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok' });
  await app.close();
});
