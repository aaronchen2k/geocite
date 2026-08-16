import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { ExecutionDiagnosisRunEntity } from './execution-diagnosis.entity';
import { CreateOptimizationActionDto, CreateOptimizationWorkOrderDto, TransitionOptimizationWorkOrderDto } from './optimization-verification.dto';
import { DiagnosisComparisonEntity, DiagnosisFindingEntity, OptimizationActionEntity, OptimizationWorkOrderEntity, OptimizationWorkOrderTransitionEntity, type WorkOrderStatus } from './optimization-verification.entity';

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['pending_verification', 'cancelled'],
  pending_verification: ['verified', 'ineffective', 'in_progress', 'cancelled'],
  verified: ['in_progress'],
  ineffective: ['in_progress', 'cancelled'],
  cancelled: ['in_progress'],
};

@Injectable()
export class OptimizationVerificationService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(ExecutionDiagnosisRunEntity) private readonly runs: Repository<ExecutionDiagnosisRunEntity>,
    @InjectRepository(DiagnosisFindingEntity) private readonly findings: Repository<DiagnosisFindingEntity>,
    @InjectRepository(OptimizationWorkOrderEntity) private readonly workOrders: Repository<OptimizationWorkOrderEntity>,
    @InjectRepository(OptimizationActionEntity) private readonly actions: Repository<OptimizationActionEntity>,
    @InjectRepository(DiagnosisComparisonEntity) private readonly comparisons: Repository<DiagnosisComparisonEntity>,
    @InjectRepository(OptimizationWorkOrderTransitionEntity) private readonly transitionHistory: Repository<OptimizationWorkOrderTransitionEntity>,
  ) {}

  async listWorkOrders(brandId: number) {
    await this.brand(brandId);
    const workOrders = await this.workOrders.find({ where: { brandId }, order: { updatedAt: 'DESC', id: 'DESC' } });
    return Promise.all(workOrders.map(async (workOrder) => ({
      ...workOrder,
      transitionHistory: await this.transitionHistory.find({
        where: { brandId, workOrderId: workOrder.id },
        order: { transitionedAt: 'ASC', id: 'ASC' },
      }),
    })));
  }

  async createWorkOrder(brandId: number, dto: CreateOptimizationWorkOrderDto) {
    await this.brand(brandId);
    if (dto.sourceRunId !== undefined) await this.sourceRun(brandId, dto.sourceRunId);
    if (dto.sourceFindingId !== undefined) await this.sourceFinding(brandId, dto.sourceFindingId);
    return this.workOrders.save(this.workOrders.create({
      brandId,
      sourceRunId: dto.sourceRunId ?? null,
      sourceFindingId: dto.sourceFindingId ?? null,
      title: this.optionalText(dto.title),
      description: this.optionalText(dto.description),
      acceptanceCriteria: this.optionalText(dto.acceptanceCriteria),
      ownerName: this.optionalText(dto.ownerName),
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      status: 'pending',
    }));
  }

  async addAction(brandId: number, workOrderId: number, dto: CreateOptimizationActionDto) {
    await this.workOrder(brandId, workOrderId);
    return this.actions.save(this.actions.create({
      brandId,
      workOrderId,
      description: dto.description.trim(),
      scope: dto.scope ?? null,
      evidence: dto.evidence ?? null,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
    }));
  }

  async transitionWorkOrder(brandId: number, workOrderId: number, dto: TransitionOptimizationWorkOrderDto) {
    const workOrder = await this.workOrder(brandId, workOrderId);
    if (!transitions[workOrder.status].includes(dto.status)) {
      throw new BadRequestException(`不允许从状态 ${workOrder.status} 流转至 ${dto.status}`);
    }
    if (dto.status === 'pending_verification' && await this.actions.count({ where: { brandId, workOrderId } }) === 0) {
      throw new BadRequestException('进入待验证前必须至少记录一项完成动作');
    }
    if (dto.status === 'verified') await this.verifiedComparison(brandId, dto);
    if (dto.status === 'cancelled' && !dto.reason?.trim()) throw new BadRequestException('取消工单必须提供原因');
    const previousStatus = workOrder.status;
    workOrder.status = dto.status;
    const savedWorkOrder = await this.workOrders.save(workOrder);
    await this.transitionHistory.save(this.transitionHistory.create({
      brandId,
      workOrderId,
      previousStatus,
      newStatus: dto.status,
      comparisonId: dto.status === 'verified' ? dto.comparisonId! : null,
      acceptanceNote: dto.status === 'verified' ? this.optionalText(dto.acceptanceNote) : null,
      cancellationReason: dto.status === 'cancelled' ? this.optionalText(dto.reason) : null,
      actor: this.optionalText(dto.actor) ?? 'system',
    }));
    return savedWorkOrder;
  }

  private async verifiedComparison(brandId: number, dto: TransitionOptimizationWorkOrderDto) {
    if (!dto.comparisonId || !dto.acceptanceNote?.trim()) {
      throw new BadRequestException('必须关联可比验证比较和验收说明');
    }
    const comparison = await this.comparisons.findOne({ where: { id: dto.comparisonId, brandId } });
    if (!comparison || comparison.comparability !== 'comparable') {
      throw new BadRequestException('必须关联可比验证比较和验收说明');
    }
  }

  private async brand(brandId: number) {
    const brand = await this.brands.findOne({ where: { id: brandId, deleted: false } });
    if (!brand) throw new NotFoundException(`品牌 ${brandId} 不存在`);
    return brand;
  }

  private async workOrder(brandId: number, id: number) {
    const workOrder = await this.workOrders.findOne({ where: { id, brandId } });
    if (!workOrder) throw new NotFoundException(`优化工单 ${id} 不存在`);
    return workOrder;
  }

  private async sourceRun(brandId: number, id: number) {
    const run = await this.runs.findOne({ where: { id, brandId } });
    if (!run) throw new NotFoundException(`诊断批次 ${id} 不存在`);
    return run;
  }

  private async sourceFinding(brandId: number, id: number) {
    const finding = await this.findings.findOne({ where: { id, brandId } });
    if (!finding) throw new NotFoundException(`诊断发现 ${id} 不存在`);
    return finding;
  }

  private optionalText(value?: string) { return value?.trim() || null; }
}
