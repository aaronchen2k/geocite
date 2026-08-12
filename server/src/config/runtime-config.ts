import fs from 'node:fs';
import path from 'node:path';

type Environment = Record<string, string | undefined>;

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
}

export function loadRuntimeConfig(directory = process.cwd(), environment: Environment = process.env) {
  const environmentName = environment.NODE_ENV === 'production' || environment.NODE_ENV === 'test'
    ? environment.NODE_ENV
    : 'development';
  const development = readEnvFile(path.join(directory, `.env.${environmentName}`));
  const local = readEnvFile(path.join(directory, '.env.local'));
  const value = (key: string, fallback: string) => environment[key] ?? local[key] ?? development[key] ?? fallback;

  return {
    host: value('HOST', '127.0.0.1'),
    port: Number(value('PORT', '8001')),
    apiPrefix: value('API_PREFIX', 'api/v1'),
    llmApiKey: value('LLM_API_KEY', ''),
  };
}
