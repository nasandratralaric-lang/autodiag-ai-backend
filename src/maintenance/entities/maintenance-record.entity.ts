import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { User } from '../../users/entities/user.entity';

@Entity('maintenance_records')
export class MaintenanceRecord {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' }) @Index()
    vehicleId: string;

    @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vehicleId' })
    vehicle: Vehicle;

    @Column({ type: 'varchar' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'enum', enum: ['oil_change','timing_belt','clutch','engine','brakes','suspension','electrical','air_conditioning','tires','other'] })
    category: string;

    @Column({ type: 'varchar' })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'date' })
    date: string;

    @Column({ type: 'int', nullable: true })
    mileageKm: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    cost: number | null;

    @Column({ type: 'varchar', default: 'MGA' })
    currency: string;

    @Column({ type: 'varchar', nullable: true })
    garageName: string | null;

    @Column({ type: 'varchar', nullable: true })
    garageAddress: string | null;

    @Column({ type: 'jsonb', nullable: true })
    partsReplaced: { name: string; reference?: string; brand?: string; quantity: number; unitCost?: number }[] | null;

    @Column({ type: 'date', nullable: true })
    nextDueDate: string | null;

    @Column({ type: 'int', nullable: true })
    nextDueMileage: number | null;

    @Column({ type: 'boolean', default: false })
    reminderSent: boolean;

    @Column({ type: 'varchar', nullable: true })
    invoiceUrl: string | null;

    @Column({ type: 'jsonb', nullable: true })
    photos: { url: string; caption?: string }[] | null;

    @Column({ type: 'text', nullable: true })
    aiSummary: string | null;

    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
}

@Entity('maintenance_reminders')
export class MaintenanceReminder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' }) vehicleId: string;
    @Column({ type: 'varchar' }) userId: string;
    @Column({ type: 'varchar' }) category: string;
    @Column({ type: 'varchar' }) title: string;
    @Column({ type: 'date', nullable: true }) dueDate: string | null;
    @Column({ type: 'int', nullable: true }) dueMileage: number | null;
    @Column({ type: 'text', nullable: true }) notes: string | null;
    @Column({ type: 'boolean', default: true }) isActive: boolean;
    @Column({ type: 'timestamptz', nullable: true }) lastNotifiedAt: Date | null;
    @CreateDateColumn() createdAt: Date;
}
