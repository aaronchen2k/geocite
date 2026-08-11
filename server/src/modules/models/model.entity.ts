import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
@Entity('models')
export class ModelEntity { @PrimaryGeneratedColumn() id!: number; @Column() name!: string; @Column({ unique: true }) modelName!: string; @Column() provider!: string; @Column({ nullable: true }) baseUrl!: string | null; @Column({ type: 'text', nullable: true }) apiKey!: string | null; @Column({ default: true }) enabled!: boolean; @Column({ default: false }) isDefault!: boolean; }
