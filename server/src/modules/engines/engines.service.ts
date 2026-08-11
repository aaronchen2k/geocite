import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEngineDto, UpdateEngineDto } from './engines.dto';
import { EngineEntity } from './engine.entity';

@Injectable()
export class EnginesService {
  constructor(@InjectRepository(EngineEntity) private readonly repository: Repository<EngineEntity>) {}
  list() { return this.repository.find({ order: { name: 'ASC' } }); }
  async findOne(id: number) { const item = await this.repository.findOneBy({ id }); if (!item) throw new NotFoundException(`Engine ${id} 不存在`); return item; }
  async create(dto: CreateEngineDto) { return this.save(this.repository.create({ ...dto, code: dto.code.trim() })); }
  async update(id: number, dto: UpdateEngineDto) { return this.save(Object.assign(await this.findOne(id), dto, dto.code ? { code: dto.code.trim() } : {})); }
  async remove(id: number) { await this.repository.remove(await this.findOne(id)); return { deleted: true, id }; }
  private async save(entity: EngineEntity) { try { return await this.repository.save(entity); } catch { throw new ConflictException('Engine code 已存在'); } }
}
