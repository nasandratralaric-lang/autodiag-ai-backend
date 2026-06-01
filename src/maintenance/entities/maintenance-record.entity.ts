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

    @Column() @Index()
    vehicleId: string;

    @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vehicleId' })
    vehicle: Vehicle;

    @Column()
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({
        type: 'enum',
        enum: ['oil_change','timing_belt','clutch','engine','brakes',
               'suspension','electrical','air_conditioning','tires','other'],
    })
    category: string;

    @Column()
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'date' })
    date: string;

    @Column({ nullable: true })
    mileageKm: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    cost: number | null;

    @Column({ default: 'MGA' })
    currency: string;

    @Column({ nullable: true })
    garageName: string | null;

    @Column({ nullable: true })
    garageAddress: string | null;

    @Column({ type: 'jsonb', nullable: true })
    partsReplaced: { name: string; reference?: string; brand?: string; quantity: number; unitCost?: number }[] | null;

    @Column({ type: 'date', nullable: true })
    nextDueDate: string | null;

    @Column({ nullable: true })
    nextDueMileage: number | null;

    @Column({ default: false })
    reminderSent: boolean;

    @Column({ nullable: true })
    invoiceUrl: string | null;

    @Column({ type: 'jsonb', nullable: true })
    photos: { url: string; caption?: string }[] | null;

    // Résumé généré par IA — injecté dans le contexte de diagnostic
    @Column({ type: 'text', nullable: true })
    aiSummary: string | null;

    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
}

@Entity('maintenance_reminders')
export class MaintenanceReminder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column() vehicleId: string;
    @Column() userId: string;
    @Column() category: string;
    @Column() title: string;
    @Column({ type: 'date', nullable: true }) dueDate: string | null;
    @Column({ nullable: true }) dueMileage: number | null;
    @Column({ type: 'text', nullable: true }) notes: string | null;
    @Column({ default: true }) isActive: boolean;
    @Column({ nullable: true }) lastNotifiedAt: Date | null;
    @CreateDateColumn() createdAt: Date;
}
