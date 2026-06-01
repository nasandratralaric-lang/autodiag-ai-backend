import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ unique: true })
    tokenHash: string;

    @Column({ type: 'jsonb', nullable: true })
    deviceInfo: { os?: string; model?: string; appVersion?: string } | null;

    @Column({ nullable: true })
    ipAddress: string | null;

    @Column()
    expiresAt: Date;

    @Column({ nullable: true })
    revokedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;
}
