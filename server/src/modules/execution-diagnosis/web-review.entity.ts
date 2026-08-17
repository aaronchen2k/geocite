import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../database/audited.entity';

export type WebReviewAvailability = 'unavailable' | 'pending_login' | 'ready';
export type BrowserLaunchStatus = 'running' | 'closed' | 'failed';

@Entity('engine_web_review_profiles')
@Index(['engineId'], { unique: true })
export class EngineWebReviewProfileEntity extends AuditedEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'engine_id' }) engineId!: number;
  @Column({ name: 'profile_id', unique: true }) profileId!: string;
  @Column({ name: 'profile_path', type: 'text' }) profilePath!: string;
  @Column({ default: 'unavailable' }) availability!: WebReviewAvailability;
  @Column({ name: 'last_checked_at', type: 'datetime', nullable: true }) lastCheckedAt!: Date | null;
  @Column({ name: 'last_failure_reason', type: 'text', nullable: true }) lastFailureReason!: string | null;
  @Column({ name: 'last_ready_at', type: 'datetime', nullable: true }) lastReadyAt!: Date | null;
}

@Entity('engine_browser_launches')
@Index(['engineId', 'launchStatus'])
export class EngineBrowserLaunchEntity extends AuditedEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'engine_id' }) engineId!: number;
  @Column({ name: 'profile_id' }) profileId!: string;
  @Column({ name: 'launch_id', unique: true }) launchId!: string;
  @Column({ name: 'profile_path', type: 'text' }) profilePath!: string;
  @Column({ name: 'current_process_id', type: 'integer', nullable: true }) currentProcessId!: number | null;
  @Column({ name: 'launch_status', default: 'running' }) launchStatus!: BrowserLaunchStatus;
  @Column({ name: 'started_at', type: 'datetime' }) startedAt!: Date;
  @Column({ name: 'last_heartbeat_at', type: 'datetime', nullable: true }) lastHeartbeatAt!: Date | null;
}
