import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEngineDto, ListEngineDto, UpdateEngineDto } from './engines.dto';
import { EngineEntity } from './engine.entity';

@Injectable()
export class EnginesService {
  constructor(@InjectRepository(EngineEntity) private readonly repository: Repository<EngineEntity>) {}
  async list(query: ListEngineDto) { const page = Number(query.page) || 1; const pageSize = Number(query.pageSize) || 20; const builder = this.repository.createQueryBuilder('engine').where('engine.deleted = :deleted', { deleted: false }); const keyword = query.keyword?.trim(); if (keyword) builder.andWhere('(engine.name LIKE :keyword OR engine.code LIKE :keyword OR engine.vendor LIKE :keyword)', { keyword: `%${keyword}%` }); if (query.vendor?.trim()) builder.andWhere('engine.vendor = :vendor', { vendor: query.vendor.trim() }); if (query.disabled !== undefined) builder.andWhere('engine.disabled = :disabled', { disabled: query.disabled }); const fields: Record<string, string> = { id: 'engine.id', ordr: 'engine.ordr', name: 'engine.name', code: 'engine.code', vendor: 'engine.vendor', disabled: 'engine.disabled', createdAt: 'engine.created_at', updatedAt: 'engine.updated_at' }; const field = fields[query.sortBy ?? ''] ?? 'engine.id'; const direction = query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'; const [items, total] = await builder.orderBy(field, direction).skip((page - 1) * pageSize).take(pageSize).getManyAndCount(); return { items, total, page, pageSize }; }
  async findOne(id: number) { const item = await this.repository.findOne({ where: { id, deleted: false } }); if (!item) throw new NotFoundException(`Engine ${id} 不存在`); return item; }
  async create(dto: CreateEngineDto) { const item = await this.save(this.repository.create({ ...dto, code: dto.code.trim() })); item.ordr = item.id * 100; return this.save(item); }
  async update(id: number, dto: UpdateEngineDto) { return this.save(Object.assign(await this.findOne(id), dto, dto.code ? { code: dto.code.trim() } : {})); }
  async remove(id: number) { const item = await this.findOne(id); item.deleted = true; item.disabled = true; item.deletedAt = new Date(); await this.repository.save(item); return { deleted: true, id }; }
  private async save(entity: EngineEntity) { try { return await this.repository.save(entity); } catch { throw new ConflictException('Engine code 已存在'); } }
}
