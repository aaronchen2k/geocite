import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../database/audited.entity';

@Entity('brands')
export class BrandEntity extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  website!: string | null;

  @Column({ nullable: true })
  industry!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ default: false })
  isDefault!: boolean;

  @Column({ default: false })
  disabled!: boolean;
}
