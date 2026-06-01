import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('vehicles')
export class Vehicle {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    @Index()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'varchar', nullable: true, unique: true })
    vin: string | null;

    @Column({ type: 'varchar', nullable: true })
    plateNumber: string | null;

    @Column({ type: 'varchar', default: 'MDG' })
    plateCountry: string;

    @Column({ type: 'varchar' })
    make: string;

    @Column({ type: 'varchar' })
    model: string;

    @Column({ type: 'smallint', nullable: true })
    year: number | null;

    @Column({ type: 'varchar', nullable: true })
    variant: string | null;

    @Column({ type: 'varchar', nullable: true })
    engineCode: string | null;

    @Column({ type: 'int', nullable: true })
    engineDisplacementCc: number | null;

    @Column({ type: 'enum', enum: ['petrol', 'diesel', 'lpg', 'electric', 'hybrid'], nullable: true })
    fuelType: string | null;

    @Column({ type: 'smallint', nullable: true })
    powerKw: number | null;

    @Column({ type: 'smallint', nullable: true })
    cylinders: number | null;

    @Column({ type: 'enum', enum: ['manual', 'automatic', 'cvt', 'semi_auto'], nullable: true })
    transmission: string | null;

    @Column({ type: 'int', default: 0 })
    mileageKm: number;

    @Column({ type: 'timestamptz', nullable: true })
    mileageUpdatedAt: Date | null;

    @Column({ type: 'varchar', nullable: true })
    photoUrl: string | null;

    @Column({ type: 'varchar', nullable: true })
    registrationCardPhotoUrl: string | null;

    @Column({ type: 'varchar', nullable: true })
    platePhotoUrl: string | null;

    @Column({ type: 'jsonb', nullable: true })
    ocrExtractedData: Record<string, any> | null;

    @Column({ type: 'boolean', default: false })
    ocrVerified: boolean;

    @Column({ type: 'boolean', default: false })
    isPrimary: boolean;

    @Column({ type: 'varchar', nullable: true })
    nickname: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date | null;

    get displayName(): string {
        return this.nickname ?? `${this.make} ${this.model} ${this.year ?? ''}`.trim();
    }

    get isOBD2Compatible(): boolean {
        return (this.year ?? 0) >= 2001;
    }
}
