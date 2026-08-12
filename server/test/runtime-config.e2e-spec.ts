import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRuntimeConfig } from '../src/config/runtime-config';

describe('runtime configuration', () => {
  it('loads .env.local after .env.development without changing process secrets', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'geocite-env-'));
    fs.writeFileSync(path.join(directory, '.env.development'), 'HOST=127.0.0.1\nPORT=8001\nAPI_PREFIX=api/v1\nLLM_API_KEY=\n');
    fs.writeFileSync(path.join(directory, '.env.local'), 'PORT=8101\nLLM_API_KEY=local-secret\n');

    const config = loadRuntimeConfig(directory, {});

    expect(config).toEqual({ host: '127.0.0.1', port: 8101, apiPrefix: 'api/v1', llmApiKey: 'local-secret' });
  });

  it('loads .env.production when NODE_ENV is production', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'geocite-production-env-'));
    fs.writeFileSync(path.join(directory, '.env.production'), 'HOST=0.0.0.0\nPORT=9001\nAPI_PREFIX=api/v1\n');

    expect(loadRuntimeConfig(directory, { NODE_ENV: 'production' })).toMatchObject({ host: '0.0.0.0', port: 9001, apiPrefix: 'api/v1' });
  });

  it('loads .env.test when NODE_ENV is test', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'geocite-test-env-'));
    fs.writeFileSync(path.join(directory, '.env.test'), 'HOST=127.0.0.1\nPORT=8101\nAPI_PREFIX=api/v1\n');

    expect(loadRuntimeConfig(directory, { NODE_ENV: 'test' })).toMatchObject({ host: '127.0.0.1', port: 8101, apiPrefix: 'api/v1' });
  });
});
