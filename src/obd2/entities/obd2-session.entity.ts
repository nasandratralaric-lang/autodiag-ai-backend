import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Entity('obd2_sessions')
export class OBD2Session {
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

    @Column({ type: 'varchar', nullable: true })
    elm327DeviceName: string | null;

    @Column({ type: 'varchar', nullable: true })
    elm327Address: string | null;

    @Column({ type: 'varchar', nullable: true })
    protocol: string | null;

    @CreateDateColumn()
    startedAt: Date;

    @Column({ type: 'timestamptz', nullable: true })
    endedAt: Date | null;

    @Column({ type: 'int', nullable: true })
    durationSeconds: number | null;

    @Column({ type: 'int', default: 0 })
    totalReadings: number;

    @Column({ type: 'jsonb', nullable: true })
    dtcsFound: { code: string; description: string; isPending: boolean }[] | null;

    @Column({ type: 'boolean', default: false })
    dtcsCleared: boolean;

    @Column({ type: 'jsonb', nullable: true })
    initialSnapshot: Record<string, any> | null;

    @Column({ type: 'decimal', precision: 7, scale: 2, nullable: true })
    avgRpm: number | null;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    avgCoolantTemp: number | null;
}
