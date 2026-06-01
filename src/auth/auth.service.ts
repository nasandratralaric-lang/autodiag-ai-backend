import {
    Injectable, UnauthorizedException, ConflictException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

export interface RegisterDto {
    email?: string;
    phone?: string;
    password?: string;
    firstName: string;
    lastName: string;
    googleId?: string;
    authProvider: 'email' | 'google' | 'phone';
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectRepository(User) private readonly users: Repository<User>,
        @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) {}

    async register(dto: RegisterDto): Promise<{ user: User; tokens: TokenPair }> {
        // Vérifier unicité email/phone
        if (dto.email) {
            const existing = await this.users.findOne({ where: { email: dto.email } });
            if (existing) throw new ConflictException('Email déjà utilisé');
        }

        const passwordHash = dto.password
            ? await bcrypt.hash(dto.password, 12)
            : null;

        const user = this.users.create({
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            authProvider: dto.authProvider,
            googleId: dto.googleId,
        });

        await this.users.save(user);
        const tokens = await this.generateTokens(user);

        this.logger.log(`New user registered: ${user.id} via ${dto.authProvider}`);
        return { user, tokens };
    }

    async loginWithEmail(email: string, password: string): Promise<{ user: User; tokens: TokenPair }> {
        const user = await this.users.findOne({ where: { email, deletedAt: IsNull() } });
        if (!user?.passwordHash) throw new UnauthorizedException('Identifiants invalides');

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) throw new UnauthorizedException('Identifiants invalides');

        await this.users.update(user.id, { lastLoginAt: new Date() });
        const tokens = await this.generateTokens(user);
        return { user, tokens };
    }

    async loginWithGoogle(googleId: string, email: string, firstName: string, lastName: string, avatarUrl?: string) {
        let user = await this.users.findOne({ where: { googleId } });

        if (!user) {
            // Chercher par email si compte existant
            user = await this.users.findOne({ where: { email } });
            if (user) {
                await this.users.update(user.id, { googleId });
            } else {
                const result = await this.register({ googleId, email, firstName, lastName, authProvider: 'google' });
                user = result.user;
            }
        }

        await this.users.update(user.id, { lastLoginAt: new Date(), avatarUrl });
        const tokens = await this.generateTokens(user);
        return { user, tokens };
    }

    async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
        const tokenHash = this.hashToken(rawRefreshToken);
        const stored = await this.tokens.findOne({
            where: { tokenHash, revokedAt: IsNull() },
            relations: ['user'],
        });

        if (!stored || stored.expiresAt < new Date()) {
            throw new UnauthorizedException('Refresh token invalide ou expiré');
        }

        // Rotation : invalider l'ancien token
        await this.tokens.update(stored.id, { revokedAt: new Date() });

        return this.generateTokens(stored.user);
    }

    async logout(userId: string, rawRefreshToken?: string): Promise<void> {
        if (rawRefreshToken) {
            const hash = this.hashToken(rawRefreshToken);
            await this.tokens.update({ tokenHash: hash }, { revokedAt: new Date() });
        } else {
            // Révoquer tous les tokens de l'utilisateur (logout partout)
            await this.tokens
                .createQueryBuilder()
                .update()
                .set({ revokedAt: new Date() })
                .where('userId = :userId AND revokedAt IS NULL', { userId })
                .execute();
        }
    }

    private async generateTokens(user: User): Promise<TokenPair> {
        const payload = {
            sub: user.id,
            email: user.email,
            plan: user.plan,
        };

        const accessToken = this.jwt.sign(payload);
        const rawRefresh = randomBytes(40).toString('hex');
        const tokenHash = this.hashToken(rawRefresh);

        const expiryDays = parseInt(this.config.get('JWT_REFRESH_EXPIRY_DAYS', '30'));
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiryDays);

        await this.tokens.save(
            this.tokens.create({ userId: user.id, tokenHash, expiresAt })
        );

        return {
            accessToken,
            refreshToken: rawRefresh,
            expiresIn: 15 * 60, // 15 minutes en secondes
        };
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}
