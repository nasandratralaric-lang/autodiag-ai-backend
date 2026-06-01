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

    @Column()
    @Index()
    vehicleId: string;

    @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vehicleId' })
    vehicle: Vehicle;

    @Column()
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ nullable: true })
    elm327DeviceName: string | null;

    @Column({ nullable: true })
    elm327Address: string | null;

    @Column({ nullable: true })
    protocol: string | null;

    @CreateDateColumn()
    startedAt: Date;

    @Column({ nullable: true })
    endedAt: Date | null;

    @Column({ nullable: true })
    durationSeconds: number | null;

    @Column({ default: 0 })
    totalReadings: number;

    @Column({ type: 'jsonb', nullable: true })
    dtcsFound: { code: string; description: string; isPending: boolean }[] | null;

    @Column({ default: false })
    dtcsCleared: boolean;

    @Column({ type: 'jsonb', nullable: true })
    initialSnapshot: Record<string, any> | null;

    @Column({ type: 'decimal', precision: 7, scale: 2, nullable: true })
    avgRpm: number | null;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    avgCoolantTemp: number | null;
}
