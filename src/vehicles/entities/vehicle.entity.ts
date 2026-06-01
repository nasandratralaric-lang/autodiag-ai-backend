import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('vehicles')
export class Vehicle {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @Index()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ nullable: true, unique: true })
    vin: string | null;

    @Column({ nullable: true })
    plateNumber: string;

    @Column({ default: 'MDG' })
    plateCountry: string;

    @Column()
    make: string;

    @Column()
    model: string;

    @Column({ type: 'smallint', nullable: true })
    year: number | null;

    @Column({ nullable: true })
    variant: string | null;

    @Column({ nullable: true })
    engineCode: string | null;

    @Column({ type: 'int', nullable: true })
    engineDisplacementCc: number | null;

    @Column({
        type: 'enum',
        enum: ['petrol', 'diesel', 'lpg', 'electric', 'hybrid'],
        nullable: true,
    })
    fuelType: string | null;

    @Column({ type: 'smallint', nullable: true })
    powerKw: number | null;

    @Column({ type: 'smallint', nullable: true })
    cylinders: number | null;

    @Column({
        type: 'enum',
        enum: ['manual', 'automatic', 'cvt', 'semi_auto'],
        nullable: true,
    })
    transmission: string | null;

    @Column({ type: 'int', default: 0 })
    mileageKm: number;

    @Column({ nullable: true })
    mileageUpdatedAt: Date | null;

    @Column({ nullable: true })
    photoUrl: string | null;

    @Column({ nullable: true })
    registrationCardPhotoUrl: string | null;

    @Column({ nullable: true })
    platePhotoUrl: string | null;

    @Column({ type: 'jsonb', nullable: true })
    ocrExtractedData: Record<string, any> | null;

    @Column({ default: false })
    ocrVerified: boolean;

    @Column({ default: false })
    isPrimary: boolean;

    @Column({ nullable: true })
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
