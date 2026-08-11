import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'; import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'; import { DataSource, Repository } from 'typeorm'; import { CreateModelDto, UpdateModelDto } from './models.dto'; import { ModelEntity } from './model.entity';
@Injectable()
export class ModelsService {
  constructor(@InjectRepository(ModelEntity) private readonly repository: Repository<ModelEntity>, @InjectDataSource() private readonly dataSource: DataSource) {}
  async list() { return (await this.repository.find({ order: { name: 'ASC' } })).map((item) => this.toResponse(item)); }
  async findOne(id: number) { const item = await this.repository.findOneBy({ id }); if (!item) throw new NotFoundException(`Model ${id} 不存在`); return item; }
  async create(dto: CreateModelDto) { return this.toResponse(await this.save(this.repository.create({ ...dto, apiKey: dto.apiKey?.trim() || null }))); }
  async update(id: number, dto: UpdateModelDto) { const item = await this.findOne(id); const { apiKey, ...rest } = dto; Object.assign(item, rest); if (apiKey !== undefined) item.apiKey = apiKey.trim() || null; return this.toResponse(await this.save(item)); }
  async setDefault(id: number) { return this.dataSource.transaction(async (manager) => { await manager.getRepository(ModelEntity).update({}, { isDefault: false }); const item = await manager.getRepository(ModelEntity).findOneBy({ id }); if (!item) throw new NotFoundException(`Model ${id} 不存在`); item.isDefault = true; return this.toResponse(await manager.getRepository(ModelEntity).save(item)); }); }
  async remove(id: number) { await this.repository.remove(await this.findOne(id)); return { deleted: true, id }; }
  private async save(item: ModelEntity) { try { return await this.repository.save(item); } catch { throw new ConflictException('Model 名称已存在'); } }
  toResponse(item: ModelEntity) { const key = item.apiKey; return { id: item.id, name: item.name, modelName: item.modelName, provider: item.provider, baseUrl: item.baseUrl, enabled: item.enabled, isDefault: item.isDefault, apiKeyConfigured: Boolean(key), apiKeyMasked: key ? `${key.slice(0, 3)}…${key.slice(-4)}` : null }; }
}
