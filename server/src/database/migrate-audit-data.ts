import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source';
import { logLocal } from '../logging/local-time';

const tables = ['brands', 'engines', 'models', 'rag_agents'];
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function migrate(): Promise<void> {
  const source = new DataSource({ ...dataSourceOptions, synchronize: false });
  await source.initialize();
  try {
    for (const table of tables) {
      const columns = await source.query(`PRAGMA table_info(${quote(table)})`) as Array<{ name: string }>;
      if (!columns.length) continue;
      const names = new Set(columns.map((column) => column.name));
      const add = async (name: string, definition: string) => { if (!names.has(name)) { await source.query(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(name)} ${definition}`); names.add(name); } };
      await add('deleted', 'boolean NOT NULL DEFAULT 0');
      await add('disabled', 'boolean NOT NULL DEFAULT 0');
      await add('created_at', 'datetime');
      await add('updated_at', 'datetime');
      await add('deleted_at', 'datetime');
      if (names.has('enabled')) await source.query(`UPDATE ${quote(table)} SET disabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END`);
      if (names.has('createdAt')) await source.query(`UPDATE ${quote(table)} SET created_at = COALESCE(created_at, createdAt)`);
      if (names.has('updatedAt')) await source.query(`UPDATE ${quote(table)} SET updated_at = COALESCE(updated_at, updatedAt)`);
      await source.query(`UPDATE ${quote(table)} SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP), updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP), deleted_at = CASE WHEN deleted = 1 THEN COALESCE(deleted_at, CURRENT_TIMESTAMP) ELSE deleted_at END`);
      logLocal(`Migrated audit columns for ${table}.`);
    }
  } finally { await source.destroy(); }
}

void migrate().catch((error) => { console.error(`[migration] ${error instanceof Error ? error.stack : String(error)}`); process.exitCode = 1; });
