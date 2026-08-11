import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('engines')
export class EngineEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column() vendor!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ default: true }) enabled!: boolean;
}
