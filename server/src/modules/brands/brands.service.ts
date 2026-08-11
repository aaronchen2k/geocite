import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BrandEntity } from './brand.entity';
import { CreateBrandDto, ListBrandDto, UpdateBrandDto } from './brands.dto';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(BrandEntity)
    private readonly repository: Repository<BrandEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async list(query: ListBrandDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const builder = this.repository.createQueryBuilder('brand');

    if (query.keyword?.trim()) {
      builder.where('(brand.name LIKE :keyword OR brand.code LIKE :keyword)', {
        keyword: `%${query.keyword.trim()}%`,
      });
    }

    const [items, total] = await builder
      .orderBy('brand.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { items, total, page, pageSize };
  }

  async create(dto: CreateBrandDto) {
    const code = dto.code.trim();
    await this.assertUniqueCode(code);
    return this.repository.save(this.repository.create({ ...dto, code }));
  }

  async findOne(id: number) {
    const brand = await this.repository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException(`Brand ${id} 不存在`);
    }
    return brand;
  }

  async update(id: number, dto: UpdateBrandDto) {
    const brand = await this.findOne(id);
    if (dto.code !== undefined) {
      dto.code = dto.code.trim();
      await this.assertUniqueCode(dto.code, id);
    }
    return this.repository.save(Object.assign(brand, dto));
  }

  async setDefault(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BrandEntity);
      const brand = await repository.findOne({ where: { id } });
      if (!brand) {
        throw new NotFoundException(`Brand ${id} 不存在`);
      }

      await repository.createQueryBuilder().update(BrandEntity).set({ isDefault: false }).execute();
      brand.isDefault = true;
      return repository.save(brand);
    });
  }

  async remove(id: number) {
    const brand = await this.findOne(id);
    if (brand.isDefault) {
      throw new BadRequestException('请先切换默认 Brand');
    }
    await this.repository.remove(brand);
    return { deleted: true, id };
  }

  private async assertUniqueCode(code: string, ignoredId?: number) {
    const builder = this.repository.createQueryBuilder('brand').where('brand.code = :code', { code });
    if (ignoredId !== undefined) {
      builder.andWhere('brand.id != :ignoredId', { ignoredId });
    }
    if (await builder.getExists()) {
      throw new ConflictException('Brand code 已存在');
    }
  }
}
