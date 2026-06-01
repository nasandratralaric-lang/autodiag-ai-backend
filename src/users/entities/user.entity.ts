import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, DeleteDateColumn, OneToMany,
} from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true, nullable: true })
    email: string | null;

    @Column({ unique: true, nullable: true })
    phone: string | null;

    @Column({ nullable: true, select: false })
    passwordHash: string | null;

    @Column({ type: 'enum', enum: ['email', 'google', 'phone'], default: 'email' })
    authProvider: string;

    @Column({ unique: true, nullable: true })
    googleId: string | null;

    @Column({ nullable: true })
    firstName: string;

    @Column({ nullable: true })
    lastName: string;

    @Column({ nullable: true })
    avatarUrl: string | null;

    @Column({ default: 'fr' })
    locale: string;

    @Column({ default: 'MDG' })
    country: string;

    @Column({ type: 'enum', enum: ['starter', 'plus', 'pro', 'fleet'], default: 'starter' })
    plan: string;

    @Column({ nullable: true })
    planExpiresAt: Date | null;

    @Column({ nullable: true })
    stripeCustomerId: string | null;

    // Consentements RGPD
    @Column({ default: false })
    consentAnalytics: boolean;

    @Column({ default: false })
    consentDataSharing: boolean;

    @Column({ default: false })
    consentMarketing: boolean;

    @Column({ nullable: true })
    consentUpdatedAt: Date | null;

    // Sécurité
    @Column({ default: false })
    emailVerified: boolean;

    @Column({ default: false })
    phoneVerified: boolean;

    @Column({ nullable: true })
    lastLoginAt: Date | null;

    @Column({ default: 0 })
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
