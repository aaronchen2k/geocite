import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { ModelEntity } from '../models/model.entity';
import { CreateRagAgentDto, ListRagAgentDto, UpdateRagAgentDto } from './rag-agents.dto';
import { RagAgentEntity } from './rag-agent.entity';

@Injectable()
export class RagAgentsService {
  constructor(@InjectRepository(RagAgentEntity) private readonly repository: Repository<RagAgentEntity>, @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>, @InjectRepository(ModelEntity) private readonly models: Repository<ModelEntity>) {}
  async list(query: ListRagAgentDto) { const page = Number(query.page) || 1; const pageSize = Number(query.pageSize) || 20; const builder = this.repository.createQueryBuilder('agent').where('agent.deleted = :deleted', { deleted: false }); const keyword = query.keyword?.trim(); if (keyword) builder.andWhere('(agent.name LIKE :keyword OR agent.code LIKE :keyword OR agent.description LIKE :keyword)', { keyword: `%${keyword}%` }); if (query.brandId !== undefined) builder.andWhere('agent.brandId = :brandId', { brandId: Number(query.brandId) }); if (query.modelId !== undefined) builder.andWhere('agent.modelId = :modelId', { modelId: Number(query.modelId) }); if (query.disabled !== undefined) builder.andWhere('agent.disabled = :disabled', { disabled: query.disabled }); const fields: Record<string, string> = { name: 'agent.name', code: 'agent.code', brandId: 'agent.brandId', modelId: 'agent.modelId', disabled: 'agent.disabled', createdAt: 'agent.created_at', updatedAt: 'agent.updated_at' }; const field = fields[query.sortBy ?? ''] ?? 'agent.name'; const direction = query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'; const [items, total] = await builder.orderBy(field, direction).skip((page - 1) * pageSize).take(pageSize).getManyAndCount(); return { items, total, page, pageSize }; }
  async findOne(id: number) { const item = await this.repository.findOne({ where: { id, deleted: false } }); if (!item) throw new BadRequestException(`RagAgent ${id} 不存在`); return item; }
  async create(dto: CreateRagAgentDto) { await this.assertReferences(dto.brandId, dto.modelId); return this.save(this.repository.create({ ...dto, code: dto.code.trim() })); }
  async update(id: number, dto: UpdateRagAgentDto) { await this.assertReferences(dto.brandId, dto.modelId); return this.save(Object.assign(await this.findOne(id), dto, { code: dto.code.trim() })); }
  async remove(id: number) { const item = await this.findOne(id); item.deleted = true; item.disabled = true; item.deletedAt = new Date(); await this.repository.save(item); return { deleted: true, id }; }
  private async assertReferences(brandId: number, modelId: number) { const brand = await this.brands.findOne({ where: { id: brandId, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${brandId} 不存在`); const model = await this.models.findOne({ where: { id: modelId, deleted: false } }); if (!model) throw new NotFoundException(`Model ${modelId} 不存在`); if (model.disabled) throw new BadRequestException('RagAgent 必须使用启用的 Model'); }
  private async save(item: RagAgentEntity) { try { return await this.repository.save(item); } catch { throw new ConflictException('RagAgent code 已存在'); } }
}
