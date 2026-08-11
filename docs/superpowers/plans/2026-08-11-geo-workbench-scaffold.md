# GEO 工作台基础脚手架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个参考 xiao2 布局的全栈 GEO 工作台，以及 Brand、Engine、Model、RagAgent 的安全 CRUD 管理能力。

**Architecture:** 使用 pnpm workspace 管理 `server`（NestJS + TypeORM + SQLite）与 `ui`（Next.js App Router）。后端以独立模块暴露 `/api/v1` 资源，前端以 `BrandWorkspaceProvider`、`AppShell` 和通用管理组件连接 API；业务导航只提供 Brand 感知的页面壳和空状态。

**Tech Stack:** Node.js 22、pnpm 10、NestJS、TypeORM、SQLite、class-validator、Next.js、React、TypeScript、Tailwind CSS、Lucide、Playwright。

## Global Constraints

- Brand 是待 GEO 优化的品牌实体，也是业务页面的当前工作区。
- 首期数据库必须使用 SQLite 与 TypeORM 的 SQLite 驱动；不得安装、导入或加载 MySQL/PostgreSQL 驱动。
- Engine 是全局被评估的 AI 引擎目录，不得与 Model 建立实体关系。
- Model 是项目内部大模型 API 配置；任何 API 响应、日志和前端状态均不得泄漏原始 API Key。
- RagAgent 必须关联已有 Brand 与启用的 Model，且不得关联 Engine。
- Brand 与 Model 各自最多一个默认项；删除默认项必须返回 400。
- 每个后端资源必须提供分页、关键字搜索、创建、详情、更新和删除。
- 业务菜单必须包含设计文档列出的仪表盘、诊断、提升、验证项；系统管理必须包含四个实体页面。

---

### Task 1: 初始化 pnpm 全栈工作区和可验证的空应用

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `server/package.json`
- Create: `server/src/main.ts`
- Create: `server/src/app.module.ts`
- Create: `server/test/health.e2e-spec.ts`
- Create: `ui/package.json`
- Create: `ui/src/app/layout.tsx`
- Create: `ui/src/app/page.tsx`
- Create: `ui/playwright.config.ts`

**Interfaces:**
- Produces: `GET /api/v1/health -> { status: 'ok' }`。
- Produces: UI 根路由重定向到 `/dashboard`。

- [ ] **Step 1: 写出健康检查失败测试**

```ts
// server/test/health.e2e-spec.ts
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --dir server test health.e2e-spec.ts`

Expected: FAIL，因为 `server/package.json` 和 `AppModule` 尚不存在。

- [ ] **Step 3: 创建工作区、服务入口和健康模块**

```json
// package.json
{"name":"geocite","private":true,"packageManager":"pnpm@10.32.1","scripts":{"build":"pnpm -r build","test":"pnpm -r test"}}
```

```yaml
# pnpm-workspace.yaml
packages:
  - server
  - ui
```

```ts
// server/src/app.module.ts
import { Controller, Get, Module } from '@nestjs/common';
@Controller('health') class HealthController { @Get() getHealth() { return { status: 'ok' as const }; } }
@Module({ controllers: [HealthController] }) export class AppModule {}
```

```ts
// server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap() { const app = await NestFactory.create(AppModule); app.setGlobalPrefix('api/v1'); await app.listen(process.env.PORT ?? 8001); }
void bootstrap();
```

- [ ] **Step 4: 运行健康检查测试**

Run: `pnpm --dir server test health.e2e-spec.ts`

Expected: PASS，响应为 `{ status: 'ok' }`。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-workspace.yaml server ui
git commit -m "chore: initialize geo workbench workspace"
```

### Task 2: 建立数据库层与 Brand CRUD

**Files:**
- Create: `server/src/database/data-source.ts`
- Create: `server/src/modules/brands/brand.entity.ts`
- Create: `server/src/modules/brands/brands.dto.ts`
- Create: `server/src/modules/brands/brands.service.ts`
- Create: `server/src/modules/brands/brands.controller.ts`
- Create: `server/src/modules/brands/brands.module.ts`
- Create: `server/test/brands.e2e-spec.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Produces: `Brand { id, name, code, website, industry, description, isDefault, enabled, createdAt, updatedAt }`。
- Produces: `PATCH /api/v1/brands/:id/default`。
- Consumes: SQLite `DataSource` from `server/src/database/data-source.ts`。

- [ ] **Step 1: 写 Brand 默认项规则失败测试**

```ts
it('sets exactly one default brand and rejects deletion of it', async () => {
  const first = await request(app.getHttpServer()).post('/api/v1/brands').send({ name: '星云', code: 'nebula' }).expect(201);
  const second = await request(app.getHttpServer()).post('/api/v1/brands').send({ name: '北斗', code: 'beidou' }).expect(201);
  await request(app.getHttpServer()).patch(`/api/v1/brands/${second.body.id}/default`).expect(200);
  await request(app.getHttpServer()).delete(`/api/v1/brands/${second.body.id}`).expect(400);
  await request(app.getHttpServer()).get('/api/v1/brands').expect(200).expect(({ body }) => expect(body.items.find((item: { id: number }) => item.id === second.body.id).isDefault).toBe(true));
  expect(first.body.code).toBe('nebula');
});
```

- [ ] **Step 2: 运行 Brand 测试并确认失败**

Run: `pnpm --dir server test brands.e2e-spec.ts`

Expected: FAIL，因为 `/brands` 路由不存在。

- [ ] **Step 3: 实现 Brand 实体、校验和服务规则**

```ts
// server/src/modules/brands/brand.entity.ts
@Entity('brands') export class BrandEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column({ nullable: true }) website!: string | null;
  @Column({ nullable: true }) industry!: string | null;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ default: false }) isDefault!: boolean;
  @Column({ default: true }) enabled!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
```

```ts
// server/src/modules/brands/brands.service.ts
async setDefault(id: number) { await this.findOne(id); await this.repository.createQueryBuilder().update(BrandEntity).set({ isDefault: false }).execute(); return this.repository.save({ ...(await this.findOne(id)), isDefault: true }); }
async remove(id: number) { const brand = await this.findOne(id); if (brand.isDefault) throw new BadRequestException('请先切换默认 Brand'); await this.repository.remove(brand); return { deleted: true, id }; }
```

- [ ] **Step 4: 完成控制器和分页/关键字查询**

```ts
// server/src/modules/brands/brands.controller.ts
@Controller('brands') export class BrandsController {
  constructor(private readonly service: BrandsService) {}
  @Get() list(@Query() query: ListBrandDto) { return this.service.list(query); }
  @Post() create(@Body() dto: CreateBrandDto) { return this.service.create(dto); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) { return this.service.update(id, dto); }
  @Patch(':id/default') setDefault(@Param('id', ParseIntPipe) id: number) { return this.service.setDefault(id); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
```

- [ ] **Step 5: 运行 Brand 测试**

Run: `pnpm --dir server test brands.e2e-spec.ts`

Expected: PASS，默认 Brand 切换成功且删除当前默认 Brand 返回 400。

- [ ] **Step 6: 提交**

```bash
git add server/src/database server/src/modules/brands server/test/brands.e2e-spec.ts
git commit -m "feat: add brand management api"
```

### Task 3: 完成全局 Engine 和内部 Model CRUD

**Files:**
- Create: `server/src/modules/engines/engine.entity.ts`
- Create: `server/src/modules/engines/engines.module.ts`
- Create: `server/src/modules/engines/engines.controller.ts`
- Create: `server/src/modules/engines/engines.service.ts`
- Create: `server/src/modules/models/model.entity.ts`
- Create: `server/src/modules/models/models.module.ts`
- Create: `server/src/modules/models/models.controller.ts`
- Create: `server/src/modules/models/models.service.ts`
- Create: `server/test/engines-models.e2e-spec.ts`

**Interfaces:**
- Produces: `Engine { id, name, code, vendor, description, enabled }`，不含 `modelId` 或 `model` 字段。
- Produces: `ModelResponse { id, name, modelName, provider, baseUrl, apiKeyConfigured, apiKeyMasked, enabled, isDefault }`。
- Produces: `PATCH /api/v1/models/:id/default`。

- [ ] **Step 1: 写 Engine/Model 分离及密钥掩码失败测试**

```ts
it('keeps engines independent and masks Model API keys', async () => {
  const engine = await request(app.getHttpServer()).post('/api/v1/engines').send({ name: '豆包', code: 'doubao', vendor: 'ByteDance' }).expect(201);
  const model = await request(app.getHttpServer()).post('/api/v1/models').send({ name: '分析模型', modelName: 'gpt-5', provider: 'OpenAI', baseUrl: 'https://api.example.com', apiKey: 'sk-secret-value' }).expect(201);
  expect(engine.body).not.toHaveProperty('modelId');
  expect(model.body).toMatchObject({ apiKeyConfigured: true, apiKeyMasked: 'sk-…alue' });
  expect(JSON.stringify(model.body)).not.toContain('sk-secret-value');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --dir server test engines-models.e2e-spec.ts`

Expected: FAIL，因为 Engine 和 Model 模块尚不存在。

- [ ] **Step 3: 实现 Engine 和 Model 实体及独立服务**

```ts
// server/src/modules/engines/engine.entity.ts
@Entity('engines') export class EngineEntity { @PrimaryGeneratedColumn() id!: number; @Column({ unique: true }) code!: string; @Column() name!: string; @Column() vendor!: string; @Column({ type: 'text', nullable: true }) description!: string | null; @Column({ default: true }) enabled!: boolean; }
```

```ts
// server/src/modules/models/models.service.ts
private toResponse(entity: ModelEntity) { return { id: entity.id, name: entity.name, modelName: entity.modelName, provider: entity.provider, baseUrl: entity.baseUrl, enabled: entity.enabled, isDefault: entity.isDefault, apiKeyConfigured: Boolean(entity.apiKey), apiKeyMasked: entity.apiKey ? `${entity.apiKey.slice(0, 3)}…${entity.apiKey.slice(-4)}` : null }; }
```

- [ ] **Step 4: 实现 Model 默认项、更新保留密钥和标准 CRUD 控制器**

```ts
// Model 更新规则
if (dto.apiKey !== undefined && dto.apiKey.trim()) entity.apiKey = dto.apiKey.trim();
if (dto.apiKey === '') entity.apiKey = null;
if (dto.apiKey === undefined) entity.apiKey = entity.apiKey;
```

- [ ] **Step 5: 运行测试**

Run: `pnpm --dir server test engines-models.e2e-spec.ts`

Expected: PASS，Engine 没有 Model 关联，Model 响应不含原始 API Key。

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/engines server/src/modules/models server/test/engines-models.e2e-spec.ts
git commit -m "feat: add engine and model management apis"
```

### Task 4: 实现 RagAgent 关系与删除约束

**Files:**
- Create: `server/src/modules/rag-agents/rag-agent.entity.ts`
- Create: `server/src/modules/rag-agents/rag-agents.dto.ts`
- Create: `server/src/modules/rag-agents/rag-agents.service.ts`
- Create: `server/src/modules/rag-agents/rag-agents.controller.ts`
- Create: `server/src/modules/rag-agents/rag-agents.module.ts`
- Create: `server/test/rag-agents.e2e-spec.ts`
- Modify: `server/src/modules/brands/brands.service.ts`
- Modify: `server/src/modules/models/models.service.ts`

**Interfaces:**
- Produces: `RagAgent { id, name, code, description, brandId, modelId, systemPrompt, enabled }`。
- Consumes: Brand ID 和启用的 Model ID。
- Produces: 关联 Brand/Model 时删除返回 400。

- [ ] **Step 1: 写 RagAgent 外键规则失败测试**

```ts
it('requires an existing Brand and an enabled Model', async () => {
  await request(app.getHttpServer()).post('/api/v1/rag-agents').send({ name: '助手', code: 'brand-agent', brandId: 999, modelId: 999 }).expect(404);
  const brand = await request(app.getHttpServer()).post('/api/v1/brands').send({ name: '星云', code: 'nebula' }).expect(201);
  const model = await request(app.getHttpServer()).post('/api/v1/models').send({ name: '禁用模型', modelName: 'gpt-5', provider: 'OpenAI', enabled: false }).expect(201);
  await request(app.getHttpServer()).post('/api/v1/rag-agents').send({ name: '助手', code: 'brand-agent', brandId: brand.body.id, modelId: model.body.id }).expect(400);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --dir server test rag-agents.e2e-spec.ts`

Expected: FAIL，因为 RagAgent 路由不存在。

- [ ] **Step 3: 实现实体及校验服务**

```ts
// server/src/modules/rag-agents/rag-agent.entity.ts
@Entity('rag_agents') export class RagAgentEntity { @PrimaryGeneratedColumn() id!: number; @Column({ unique: true }) code!: string; @Column() name!: string; @Column({ type: 'text', nullable: true }) description!: string | null; @ManyToOne(() => BrandEntity, { onDelete: 'RESTRICT' }) brand!: BrandEntity; @Column() brandId!: number; @ManyToOne(() => ModelEntity, { onDelete: 'RESTRICT' }) model!: ModelEntity; @Column() modelId!: number; @Column({ type: 'text', default: '' }) systemPrompt!: string; @Column({ default: true }) enabled!: boolean; }
```

```ts
// server/src/modules/rag-agents/rag-agents.service.ts
async assertReferences(brandId: number, modelId: number) { await this.brands.findOne(brandId); const model = await this.models.findOne(modelId); if (!model.enabled) throw new BadRequestException('RagAgent 必须使用启用的 Model'); }
```

- [ ] **Step 4: 完成 CRUD、关联删除保护和响应摘要**

```ts
// Brand/Model 删除前查询 RagAgent 引用数量；数量大于 0 时：
throw new BadRequestException('存在关联的 RagAgent，无法删除');
```

- [ ] **Step 5: 运行测试**

Run: `pnpm --dir server test rag-agents.e2e-spec.ts`

Expected: PASS，不存在的 Brand/Model 返回 404，禁用 Model 返回 400。

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/rag-agents server/src/modules/brands server/src/modules/models server/test/rag-agents.e2e-spec.ts
git commit -m "feat: add brand rag agent management api"
```

### Task 5: 建立前端 App Shell、品牌上下文和完整导航

**Files:**
- Create: `ui/src/lib/api.ts`
- Create: `ui/src/lib/navigation.ts`
- Create: `ui/src/components/brand-workspace-provider.tsx`
- Create: `ui/src/components/brand-selector.tsx`
- Create: `ui/src/components/app-shell.tsx`
- Create: `ui/src/components/page-shell.tsx`
- Create: `ui/src/app/(workspace)/layout.tsx`
- Create: `ui/src/app/(workspace)/dashboard/page.tsx`
- Create: `ui/src/app/(workspace)/[section]/[page]/page.tsx`
- Create: `ui/src/components/app-shell.spec.tsx`

**Interfaces:**
- Produces: `useBrandWorkspace(): { brands, selectedBrand, selectBrand, loading, error }`。
- Produces: `navigationTree`，包含设计中的 20 个业务/系统管理菜单项。
- Consumes: `GET /api/v1/brands` 与 `PATCH /api/v1/brands/:id/default`。

- [ ] **Step 1: 写菜单和 Brand 切换失败测试**

```tsx
it('renders GEO groups and updates the selected Brand', async () => {
  server.use(http.get('/api/v1/brands', () => HttpResponse.json({ items: [{ id: 1, name: '星云', code: 'nebula', isDefault: true }], total: 1, page: 1, pageSize: 20 })));
  render(<AppShell><div>页面内容</div></AppShell>);
  expect(await screen.findByText('诊断')).toBeInTheDocument();
  expect(screen.getByText('提升')).toBeInTheDocument();
  expect(screen.getByText('验证')).toBeInTheDocument();
  expect(screen.getByText('系统管理')).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveTextContent('星云');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --dir ui test app-shell.spec.tsx`

Expected: FAIL，因为 AppShell 和 Brand Provider 尚不存在。

- [ ] **Step 3: 实现 API 客户端、Brand Provider 和选择器**

```ts
// ui/src/components/brand-workspace-provider.tsx
export type BrandWorkspace = { brands: Brand[]; selectedBrand: Brand | null; selectBrand: (id: number) => Promise<void>; loading: boolean; error: string | null };
// selectBrand 调用 setDefaultBrand(id)，成功后更新 brands 与 selectedBrand。
```

```tsx
// ui/src/components/brand-selector.tsx
export function BrandSelector() { const { brands, selectedBrand, selectBrand, loading } = useBrandWorkspace(); return <select aria-label="选择 Brand" value={selectedBrand?.id ?? ''} disabled={loading || !brands.length} onChange={(event) => void selectBrand(Number(event.target.value))}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name} · {brand.code}</option>)}</select>; }
```

- [ ] **Step 4: 实现 xiao2 风格顶栏、响应式侧栏与菜单树**

```ts
// ui/src/lib/navigation.ts
export const navigationTree = [
  { key: 'dashboard', title: '仪表盘', href: '/dashboard' },
  { key: 'diagnosis', title: '诊断', children: ['citation-detection','competitor-comparison','asset-audit','channel-map','comprehensive-report'] },
  { key: 'improvement', title: '提升', children: ['optimization-work-orders','keyword-matrix','source-building','technical-adaptation','content-production'] },
  { key: 'verification', title: '验证', children: ['visibility-trend','rank-tracking','attribution','comparison-test','periodic-retest'] },
  { key: 'admin', title: '系统管理', children: ['brands','engines','models','rag-agents'] },
] as const;
```

- [ ] **Step 5: 运行前端单元测试**

Run: `pnpm --dir ui test app-shell.spec.tsx`

Expected: PASS，四个一级组与顶部 Brand 选择器均可见。

- [ ] **Step 6: 提交**

```bash
git add ui/src
git commit -m "feat: add geo workspace shell and brand selector"
```

### Task 6: 构建四个系统管理 CRUD 页面与业务占位页

**Files:**
- Create: `ui/src/components/admin/resource-table.tsx`
- Create: `ui/src/components/admin/resource-dialog.tsx`
- Create: `ui/src/app/(workspace)/admin/brands/page.tsx`
- Create: `ui/src/app/(workspace)/admin/engines/page.tsx`
- Create: `ui/src/app/(workspace)/admin/models/page.tsx`
- Create: `ui/src/app/(workspace)/admin/rag-agents/page.tsx`
- Create: `ui/src/components/geo-feature-placeholder.tsx`
- Create: `ui/src/app/(workspace)/diagnosis/[feature]/page.tsx`
- Create: `ui/src/app/(workspace)/improvement/[feature]/page.tsx`
- Create: `ui/src/app/(workspace)/verification/[feature]/page.tsx`
- Create: `ui/src/app/(workspace)/admin/admin-pages.spec.tsx`

**Interfaces:**
- Consumes: 所有管理资源的标准 CRUD API。
- Produces: `ResourceTable<T>`，接收列定义、加载函数、保存函数和删除函数。
- Produces: 业务页 `GeoFeaturePlaceholder { title, description, selectedBrand }`。

- [ ] **Step 1: 写 Model 密钥与 RagAgent 下拉项失败测试**

```tsx
it('does not render a Model API key and only offers enabled models to RagAgent', async () => {
  render(<RagAgentsPage />);
  expect(await screen.findByLabelText('Model')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('sk-secret-value')).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: '分析模型' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --dir ui test admin-pages.spec.tsx`

Expected: FAIL，因为管理页面不存在。

- [ ] **Step 3: 实现通用表格、表单和四个资源配置**

```tsx
// ui/src/components/admin/resource-table.tsx
export type ResourceColumn<T> = { header: string; render: (item: T) => ReactNode };
export function ResourceTable<T extends { id: number }>({ items, columns, onEdit, onDelete }: { items: T[]; columns: ResourceColumn<T>[]; onEdit: (item: T) => void; onDelete: (item: T) => void }) {
  return <table><tbody>{items.map((item) => <tr key={item.id}>{columns.map((column) => <td key={column.header}>{column.render(item)}</td>)}<td><button onClick={() => onEdit(item)}>编辑</button><button onClick={() => onDelete(item)}>删除</button></td></tr>)}</tbody></table>;
}
```

```ts
// Model 列表仅展示 apiKeyConfigured 与 apiKeyMasked，不将 apiKey 放入表单默认值。
// RagAgent 表单请求 GET /brands 和 GET /models?enabled=true，以 Brand/Model ID 作为提交值。
```

- [ ] **Step 4: 实现业务占位页**

```tsx
export function GeoFeaturePlaceholder({ title, description }: { title: string; description: string }) {
  const { selectedBrand } = useBrandWorkspace();
  return <PageShell title={title} description={description}><section>{selectedBrand ? `${selectedBrand.name} 的 ${title} 将在此展示。` : '请先在系统管理中创建并选择 Brand。'}</section></PageShell>;
}
```

- [ ] **Step 5: 运行管理页测试与前端构建**

Run: `pnpm --dir ui test admin-pages.spec.tsx && pnpm --dir ui build`

Expected: PASS，构建完成且不渲染 API Key。

- [ ] **Step 6: 提交**

```bash
git add ui/src
git commit -m "feat: add geo admin pages and feature placeholders"
```

### Task 7: 端到端验证、运行文档和质量门禁

**Files:**
- Create: `e2e/geo-workbench.spec.ts`
- Create: `quickstart.md`
- Modify: `package.json`
- Modify: `ui/playwright.config.ts`

**Interfaces:**
- Consumes: 本地 `server` 的 8001 端口和 `ui` 的 8000 端口。
- Produces: `pnpm test:e2e` 验证 Brand、Model、RagAgent、导航和密钥不可见。

- [ ] **Step 1: 写端到端验收场景**

```ts
test('manages the GEO scaffold without coupling Engine and Model', async ({ page }) => {
  await page.goto('/admin/brands');
  await page.getByRole('button', { name: '新建 Brand' }).click();
  await page.getByLabel('名称').fill('星云');
  await page.getByLabel('编码').fill('nebula');
  await page.getByRole('button', { name: '保存' }).click();
  await page.goto('/admin/engines');
  await expect(page.getByText('豆包')).toBeVisible();
  await page.goto('/admin/models');
  await expect(page.locator('body')).not.toContainText('sk-secret-value');
  await page.getByLabel('选择 Brand').selectOption({ label: /星云/ });
  await page.getByText('诊断').click();
  await expect(page.getByText('引用检测')).toBeVisible();
});
```

- [ ] **Step 2: 运行 E2E 并确认初次失败**

Run: `pnpm test:e2e`

Expected: FAIL，直到 server/UI 启动脚本与 CRUD 页面完整接入。

- [ ] **Step 3: 配置 E2E 启动与快速开始文档**

```json
// package.json scripts
{"dev:server":"pnpm --dir server start:dev","dev:ui":"pnpm --dir ui dev","test:e2e":"playwright test"}
```

```markdown
# GEO 工作台本地启动
1. `pnpm install`
2. `pnpm dev:server`
3. `pnpm dev:ui`
4. 打开 `http://127.0.0.1:8000/dashboard`
```

- [ ] **Step 4: 运行全量质量门禁**

Run: `pnpm test && pnpm build && pnpm test:e2e`

Expected: 所有单元、API、构建和 E2E 测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add e2e quickstart.md package.json ui/playwright.config.ts
git commit -m "test: cover geo workbench scaffold"
```

### Task 8: 补齐安全的开发环境配置

**Files:**
- Create: `server/.env.example`
- Create: `server/.env.development`
- Create: `ui/.env.example`
- Create: `ui/.env.local`
- Modify: `.gitignore`
- Modify: `server/src/main.ts`
- Modify: `quickstart.md`
- Test: `server/test/environment-config.spec.ts`

**Interfaces:**
- Produces: 后端开发配置读取 `HOST`、`PORT`、`API_PREFIX`、`DB_PATH`、`LOG_DIR`，默认监听 `127.0.0.1:8001`。
- Produces: 前端 `NEXT_PUBLIC_API_BASE_URL` 和 `NEXT_PUBLIC_API_WS_URL` 指向 `http://127.0.0.1:8001/api/v1` 与 `ws://127.0.0.1:8001/api/v1`。

- [ ] **Step 1: 写失败测试，证明开发配置覆盖端口与 API 前缀**

```ts
it('loads the development host, port and API prefix without loading secrets', () => {
  const config = loadRuntimeConfig({ HOST: '127.0.0.1', PORT: '8001', API_PREFIX: 'api/v1', DB_PATH: 'data/geocite.db', LOG_DIR: 'logs' });
  expect(config).toEqual({ host: '127.0.0.1', port: 8001, apiPrefix: 'api/v1', dbPath: 'data/geocite.db', logDir: 'logs' });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --dir server test environment-config.spec.ts`

Expected: FAIL，因为 `loadRuntimeConfig` 尚不存在。

- [ ] **Step 3: 实现运行时配置加载与无密钥示例文件**

```dotenv
# server/.env.example
HOST=127.0.0.1
PORT=8001
API_PREFIX=api/v1
DB_PATH=data/geocite.db
LOG_DIR=logs
LLM_API_KEY=
```

```dotenv
# ui/.env.example
PORT=8000
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001/api/v1
NEXT_PUBLIC_API_WS_URL=ws://127.0.0.1:8001/api/v1
```

将 `.env`、`.env.*` 加入 `.gitignore`，再以否定规则保留两个 `.env.example`；`server/.env.development` 与 `ui/.env.local` 只写本机开发地址和空密钥，禁止包含真实凭据。

- [ ] **Step 4: 运行配置测试、服务构建与前端构建**

Run: `pnpm --dir server test environment-config.spec.ts && pnpm --dir server build && pnpm --dir ui build`

Expected: 全部 PASS，且 `git status --ignored` 显示本地环境文件已忽略、示例文件被跟踪。

- [ ] **Step 5: 提交**

```bash
git add .gitignore server/.env.example ui/.env.example server/src/main.ts quickstart.md server/test/environment-config.spec.ts
git commit -m "chore: add local development environment configuration"
```
