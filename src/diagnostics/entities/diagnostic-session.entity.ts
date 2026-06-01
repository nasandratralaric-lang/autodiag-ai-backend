import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Entity('diagnostic_sessions')
export class DiagnosticSession {
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
    obd2SessionId: string | null;

    @Column({ type: 'enum', enum: ['pending','in_progress','completed','cancelled'], default: 'pending' })
    status: string;

    @Column({ type: 'jsonb', default: '[]' })
    symptoms: object[];

    @Column({ type: 'jsonb', default: '[]' })
    recentWorks: object[];

    @Column({ type: 'text', nullable: true })
    userDescription: string | null;

    @Column({ type: 'jsonb', nullable: true })
    obdSnapshot: Record<string, any> | null;

    @Column({ type: 'text', nullable: true })
    aiContextSent: string | null;

    @Column({ type: 'varchar', nullable: true })
    aiProvider: string | null;

    @Column({ type: 'varchar', nullable: true })
    aiModel: string | null;

    @Column({ type: 'int', nullable: true })
    aiTokensUsed: number | null;

    @Column({ type: 'varchar', nullable: true })
    primaryCause: string | null;

    @Column({ type: 'smallint', nullable: true })
    confidence: number | null;

    @Column({ type: 'varchar', nullable: true })
    severity: string | null;

    @Column({ type: 'varchar', nullable: true })
    driveRisk: string | null;

    @Column({ type: 'jsonb', nullable: true })
    result: Record<string, any> | null;

    @Column({ type: 'boolean', nullable: true })
    repairDone: boolean | null;

    @Column({ type: 'text', nullable: true })
    repairDescription: string | null;

    @Column({ type: 'boolean', nullable: true })
    repairResolved: boolean | null;

    @Column({ type: 'timestamptz', nullable: true })
    feedbackAt: Date | null;

    @OneToMany(() => DiagnosticMessage, m => m.session, { cascade: true })
    messages: DiagnosticMessage[];

    @OneToMany(() => DiagnosticTest, t => t.session, { cascade: true })
    tests: DiagnosticTest[];

    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
}

@Entity('diagnostic_messages')
export class DiagnosticMessage {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' }) @Index()
    sessionId: string;

    @ManyToOne(() => DiagnosticSession, s => s.messages, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sessionId' })
    session: DiagnosticSession;

    @Column({ type: 'varchar', length: 20 })
    role: 'user' | 'assistant' | 'system';

    @Column({ type: 'text' })
    content: string;

    @Column({ type: 'varchar', nullable: true })
    messageType: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any> | null;

    @CreateDateColumn()
    createdAt: Date;
}

@Entity('diagnostic_tests')
export class DiagnosticTest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' }) @Index()
    sessionId: string;

    @ManyToOne(() => DiagnosticSession, s => s.tests, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sessionId' })
    session: DiagnosticSession;

    @Column({ type: 'smallint' })
    sequenceOrder: number;

    @Column({ type: 'varchar' })
    title: string;

    @Column({ type: 'text' })
    instructions: string;

    @Column({ type: 'jsonb', nullable: true })
    preconditions: string[] | null;

    @Column({ type: 'int', nullable: true })
    estimatedDurationSeconds: number | null;

    @Column({ type: 'text', array: true, nullable: true })
    risks: string[] | null;

    @Column({ type: 'text', array: true, nullable: true })
    pidsMonitored: string[] | null;

    @Column({ type: 'jsonb', nullable: true })
    obdDataBefore: Record<string, any> | null;

    @Column({ type: 'jsonb', nullable: true })
    obdDataAfter: Record<string, any> | null;

    @Column({ type: 'enum', enum: ['pending','running','completed','skipped','failed'], default: 'pending' })
    status: string;

    @Column({ type: 'text', nullable: true })
    userResponse: string | null;

    @Column({ type: 'text', nullable: true })
    aiInterpretation: string | null;

    @Column({ type: 'timestamptz', nullable: true }) startedAt: Date | null;
    @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;
}
