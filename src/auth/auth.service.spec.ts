import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

const mockUser = (overrides = {}): User => ({
    id: 'user-1',
    email: 'test@example.com',
    phone: null,
    passwordHash: '$2b$12$hashedpassword',
    authProvider: 'email',
    googleId: null,
    firstName: 'Jean',
    lastName: 'Rakoto',
    avatarUrl: null,
    locale: 'fr',
    country: 'MDG',
    plan: 'starter',
    planExpiresAt: null,
    stripeCustomerId: null,
    consentAnalytics: false,
    consentDataSharing: false,
    consentMarketing: false,
    consentUpdatedAt: null,
    emailVerified: false,
    phoneVerified: false,
    lastLoginAt: null,
    loginCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    get displayName() { return 'Jean Rakoto'; },
    get isProUser() { return false; },
    get canUseOBD2() { return false; },
    get canUseAI() { return false; },
    ...overrides,
} as User);

describe('AuthService', () => {
    let service: AuthService;
    let usersRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };
    let tokensRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
    let jwtService: { sign: jest.Mock };

    beforeEach(async () => {
        usersRepo = {
            findOne: jest.fn(),
            create: jest.fn(dto => ({ ...mockUser(), ...dto })),
            save: jest.fn(entity => Promise.resolve(entity)),
            update: jest.fn().mockResolvedValue({}),
        };
        tokensRepo = {
            findOne: jest.fn(),
            create: jest.fn(dto => dto),
            save: jest.fn(entity => Promise.resolve(entity)),
            update: jest.fn().mockResolvedValue({}),
            createQueryBuilder: jest.fn(),
        };
        jwtService = { sign: jest.fn().mockReturnValue('mock-access-token') };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: getRepositoryToken(User), useValue: usersRepo },
                { provide: getRepositoryToken(RefreshToken), useValue: tokensRepo },
                { provide: JwtService, useValue: jwtService },
                { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('30') } },
            ],
        }).compile();

        service = module.get(AuthService);
    });

    describe('register', () => {
        it('crée un nouvel utilisateur et retourne les tokens', async () => {
            usersRepo.findOne.mockResolvedValue(null);

            const result = await service.register({
                email: 'new@example.com',
                password: 'password123',
                firstName: 'Jean',
                lastName: 'Rakoto',
                authProvider: 'email',
            });

            expect(result.user).toBeDefined();
            expect(result.tokens.accessToken).toBe('mock-access-token');
            expect(result.tokens.refreshToken).toBeDefined();
        });

        it('lève ConflictException si email déjà utilisé', async () => {
            usersRepo.findOne.mockResolvedValue(mockUser());

            await expect(service.register({
                email: 'existing@example.com',
                firstName: 'A',
                lastName: 'B',
                authProvider: 'email',
            })).rejects.toThrow(ConflictException);
        });
    });

    describe('loginWithEmail', () => {
        it('retourne les tokens si identifiants valides', async () => {
            const hashed = await bcrypt.hash('correctpassword', 12);
            usersRepo.findOne.mockResolvedValue(mockUser({ passwordHash: hashed }));

            const result = await service.loginWithEmail('test@example.com', 'correctpassword');
            expect(result.tokens.accessToken).toBe('mock-access-token');
        });

        it('lève UnauthorizedException si mot de passe incorrect', async () => {
            const hashed = await bcrypt.hash('correctpassword', 12);
            usersRepo.findOne.mockResolvedValue(mockUser({ passwordHash: hashed }));

            await expect(
                service.loginWithEmail('test@example.com', 'wrongpassword')
            ).rejects.toThrow(UnauthorizedException);
        });

        it('lève UnauthorizedException si utilisateur non trouvé', async () => {
            usersRepo.findOne.mockResolvedValue(null);

            await expect(
                service.loginWithEmail('unknown@example.com', 'password')
            ).rejects.toThrow(UnauthorizedException);
        });
    });
});
