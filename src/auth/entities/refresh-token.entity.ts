import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'varchar', unique: true })
    tokenHash: string;

    @Column({ type: 'jsonb', nullable: true })
    deviceInfo: { os?: string; model?: string; appVersion?: string } | null;

    @Column({ type: 'varchar', nullable: true })
    ipAddress: string | null;

    @Column({ type: 'timestamptz' })
    expiresAt: Date;

    @Column({ type: 'timestamptz', nullable: true })
    revokedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;
}
