import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BrandEntity } from './brand.entity';
import { BrandEngineEntity } from './brand-engine.entity';
import { EngineEntity } from '../engines/engine.entity';
import { CreateBrandDto, ListBrandDto, UpdateBrandDto } from './brands.dto';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(BrandEntity) private readonly repository: Repository<BrandEntity>,
    @InjectRepository(BrandEngineEntity) private readonly brandEngines: Repository<BrandEngineEntity>,
    @InjectRepository(EngineEntity) private readonly engines: Repository<EngineEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(query: ListBrandDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const builder = this.repository.createQueryBuilder('brand').where('brand.deleted = :deleted', { deleted: false });
    if (query.keyword?.trim()) builder.andWhere('(brand.name LIKE :keyword OR brand.code LIKE :keyword)', { keyword: `%${query.keyword.trim()}%` });
    if (query.disabled !== undefined) builder.andWhere('brand.disabled = :disabled', { disabled: query.disabled });
    const fields: Record<string, string> = { name: 'brand.name', code: 'brand.code', industry: 'brand.industry', disabled: 'brand.disabled', createdAt: 'brand.created_at', updatedAt: 'brand.updated_at' };
    const field = fields[query.sortBy ?? ''] ?? 'brand.created_at';
    const direction = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const [items, total] = await builder.orderBy(field, direction).skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items: await Promise.all(items.map((item) => this.toResponse(item))), total, page, pageSize };
  }

  async create(dto: CreateBrandDto) {
    const { engineIds = [], ...data } = dto;
    const code = data.code.trim();
    await this.assertUniqueCode(code);
    return this.dataSource.transaction(async (manager) => {
      const brand = await manager.getRepository(BrandEntity).save(manager.getRepository(BrandEntity).create({ ...data, code }));
      await this.replaceEngineLinks(brand.id, engineIds, manager);
      return this.toResponse(brand);
    });
  }
  async findOne(id: number) { const brand = await this.repository.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); return brand; }
  async detail(id: number) { return this.toResponse(await this.findOne(id)); }
  async update(id: number, dto: UpdateBrandDto) {
    const { engineIds, ...data } = dto;
    const brand = await this.findOne(id);
    if (data.code !== undefined) { data.code = data.code.trim(); await this.assertUniqueCode(data.code, id); }
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(BrandEntity).save(Object.assign(brand, data));
      if (engineIds !== undefined) await this.replaceEngineLinks(id, engineIds, manager);
      return this.toResponse(saved);
    });
  }
  async setDefault(id: number) { return this.dataSource.transaction(async (manager) => { const repository = manager.getRepository(BrandEntity); const brand = await repository.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); await repository.createQueryBuilder().update(BrandEntity).set({ isDefault: false }).where('deleted = :deleted', { deleted: false }).execute(); brand.isDefault = true; return repository.save(brand); }); }
  async remove(id: number) { const brand = await this.findOne(id); if (brand.isDefault) throw new BadRequestException('请先切换默认 Brand'); brand.deleted = true; brand.disabled = true; brand.deletedAt = new Date(); await this.repository.save(brand); return { deleted: true, id }; }
  private async assertUniqueCode(code: string, ignoredId?: number) { const builder = this.repository.createQueryBuilder('brand').where('brand.code = :code', { code }).andWhere('brand.deleted = :deleted', { deleted: false }); if (ignoredId !== undefined) builder.andWhere('brand.id != :ignoredId', { ignoredId }); if (await builder.getExists()) throw new ConflictException('Brand code 已存在'); }
  private async replaceEngineLinks(brandId: number, engineIds: number[], manager: DataSource['manager']) {
    const ids = [...new Set(engineIds)];
    if (ids.length) {
      const count = await manager.getRepository(EngineEntity).count({ where: ids.map((id) => ({ id, deleted: false })) });
      if (count !== ids.length) throw new BadRequestException('包含不存在的目标引擎');
    }
    const links = manager.getRepository(BrandEngineEntity);
    await links.delete({ brandId });
    if (ids.length) await links.save(ids.map((engineId) => links.create({ brandId, engineId })));
  }
  private async toResponse(brand: BrandEntity) {
    const engineIds = (await this.brandEngines.find({ where: { brandId: brand.id }, order: { engineId: 'ASC' } })).map((link) => link.engineId);
    return { ...brand, engineIds };
  }
}
