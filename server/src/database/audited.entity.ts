import { Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** Shared lifecycle columns for every persisted management record. */
export abstract class AuditedEntity {
  @Column({ default: false })
  deleted!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt!: Date | null;
}
