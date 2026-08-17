import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** System-owned, versioned question taxonomy. It is never edited from brand configuration. */
@Entity('diagnosis_question_taxonomy')
export class DiagnosisQuestionTaxonomyEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true }) code!: string;
  @Column({ name: 'primary_code' }) primaryCode!: string;
  @Column({ name: 'primary_category' }) primaryCategory!: string;
  @Column({ name: 'secondary_category' }) secondaryCategory!: string;
  @Column({ type: 'integer' }) weight!: number;
  @Column({ type: 'text' }) example!: string;
  @Column({ default: 'v1' }) version!: string;
  @Column({ default: 0 }) ordr!: number;
}
