import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'; import { InjectRepository } from '@nestjs/typeorm'; import { Repository } from 'typeorm'; import { BrandEntity } from '../brands/brand.entity'; import { ModelEntity } from '../models/model.entity'; import { CreateRagAgentDto, UpdateRagAgentDto } from './rag-agents.dto'; import { RagAgentEntity } from './rag-agent.entity';
@Injectable() export class RagAgentsService {
  constructor(@InjectRepository(RagAgentEntity) private readonly repository: Repository<RagAgentEntity>, @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>, @InjectRepository(ModelEntity) private readonly models: Repository<ModelEntity>) {}
  list() { return this.repository.find({ order: { name: 'ASC' } }); }
  async findOne(id: number) { const item = await this.repository.findOneBy({ id }); if (!item) throw new BadRequestException(`RagAgent ${id} 不存在`); return item; }
  async create(dto: CreateRagAgentDto) { await this.assertReferences(dto.brandId, dto.modelId); return this.save(this.repository.create({ ...dto, code: dto.code.trim() })); }
  async update(id: number, dto: UpdateRagAgentDto) { await this.assertReferences(dto.brandId, dto.modelId); return this.save(Object.assign(await this.findOne(id), dto, { code: dto.code.trim() })); }
  async remove(id: number) { await this.repository.remove(await this.findOne(id)); return { deleted: true, id }; }
  private async assertReferences(brandId: number, modelId: number) { const brand = await this.brands.findOneBy({ id: brandId }); if (!brand) throw new (require('@nestjs/common').NotFoundException)(`Brand ${brandId} 不存在`); const model = await this.models.findOneBy({ id: modelId }); if (!model) throw new (require('@nestjs/common').NotFoundException)(`Model ${modelId} 不存在`); if (!model.enabled) throw new BadRequestException('RagAgent 必须使用启用的 Model'); }
  private async save(item: RagAgentEntity) { try { return await this.repository.save(item); } catch { throw new ConflictException('RagAgent code 已存在'); } }
}
