import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', unique: true, nullable: true })
    email: string | null;

    @Column({ type: 'varchar', unique: true, nullable: true })
    phone: string | null;

    @Column({ type: 'varchar', nullable: true, select: false })
    passwordHash: string | null;

    @Column({ type: 'enum', enum: ['email', 'google', 'phone'], default: 'email' })
    authProvider: string;

    @Column({ type: 'varchar', unique: true, nullable: true })
    googleId: string | null;

    @Column({ type: 'varchar', nullable: true })
    firstName: string | null;

    @Column({ type: 'varchar', nullable: true })
    lastName: string | null;

    @Column({ type: 'varchar', nullable: true })
    avatarUrl: string | null;

    @Column({ type: 'varchar', default: 'fr' })
    locale: string;

    @Column({ type: 'varchar', default: 'MDG' })
    country: string;

    @Column({ type: 'enum', enum: ['starter', 'plus', 'pro', 'fleet'], default: 'starter' })
    plan: string;

    @Column({ type: 'timestamptz', nullable: true })
    planExpiresAt: Date | null;

    @Column({ type: 'varchar', nullable: true })
    stripeCustomerId: string | null;

    // Niveau de connaissance mécanique — adapte le langage du diagnostic IA
    @Column({
        type: 'enum',
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner',
    })
    mechanicLevel: string;

    @Column({ type: 'boolean', default: false })
    consentAnalytics: boolean;

    @Column({ type: 'boolean', default: false })
    consentDataSharing: boolean;

    @Column({ type: 'boolean', default: false })
    consentMarketing: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    consentUpdatedAt: Date | null;

    @Column({ type: 'boolean', default: false })
    emailVerified: boolean;

    @Column({ type: 'boolean', default: false })
    phoneVerified: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    lastLoginAt: Date | null;

    @Column({ type: 'int', default: 0 })
    loginCount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date | null;

    get displayName(): string {
        return `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim();
    }

    get isProUser(): boolean {
        return this.plan === 'pro' || this.plan === 'fleet';
    }

    get canUseOBD2(): boolean {
        return this.plan !== 'starter';
    }

    get canUseAI(): boolean {
        return this.plan === 'pro' || this.plan === 'fleet';
    }
}
