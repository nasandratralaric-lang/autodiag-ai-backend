import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import {
    AIProviderInterface, DiagnosticRequest, DiagnosticResponse,
    TestRefinementRequest, ChatMessage,
} from './ai.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';

@Injectable()
export class AIService {
    private readonly logger = new Logger(AIService.name);
    private readonly providers: AIProviderInterface[];
    private readonly CACHE_TTL_SECONDS = 3600;

    constructor(
        private readonly config: ConfigService,
        private readonly openai: OpenAIProvider,
        private readonly openrouter: OpenRouterProvider,
        private readonly claude: ClaudeProvider,
        private readonly gemini: GeminiProvider,
        @InjectRedis() private readonly redis: Redis,
    ) {
        // Ordre de priorité :
        // 1. OpenAI (si OPENAI_API_KEY configurée)
        // 2. OpenRouter (si OPENROUTER_API_KEY configurée) — fallback principal
        // 3. Claude (si ANTHROPIC_API_KEY configurée)
        // 4. Gemini (si GOOGLE_GEMINI_API_KEY configurée)
        // Les providers sans clé sont ignorés automatiquement (ils throw immédiatement)
        this.providers = [openai, openrouter, claude, gemini];

        const active = this.getActiveProviders();
        if (active.length === 0) {
            this.logger.error('⚠️  Aucun provider IA configuré ! Ajoutez au moins OPENAI_API_KEY ou OPENROUTER_API_KEY.');
        } else {
            this.logger.log(`Providers IA actifs : ${active.map(p => `${p.name}(${p.model})`).join(' → ')}`);
        }
    }

    async analyze(request: DiagnosticRequest): Promise<DiagnosticResponse & { provider: string; cached: boolean }> {
        const cacheKey = this.buildCacheKey(request);

        const cached = await this.redis.get(cacheKey);
        if (cached) {
            this.logger.log('Cache hit — diagnostic retourné depuis le cache');
            return { ...JSON.parse(cached), cached: true, provider: 'cache' };
        }

        let lastError: Error | null = null;
        for (const provider of this.providers) {
            try {
                this.logger.log(`Essai provider: ${provider.name} (${provider.model})`);
                const result = await this.withTimeout(
                    provider.analyze(request),
                    20_000,
                    `${provider.name} timeout`
                );
                await this.redis.setex(cacheKey, this.CACHE_TTL_SECONDS, JSON.stringify(result));
                return { ...result, provider: provider.name, cached: false };
            } catch (error) {
                this.logger.error(`Provider ${provider.name} FAILED: ${error.message}`, error.stack);
                lastError = error;
            }
        }

        this.logger.error('Tous les providers IA ont échoué — fallback DTC');
        return this.buildFallbackResponse(request, lastError);
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse & { provider: string }> {
        for (const provider of this.providers) {
            try {
                const result = await this.withTimeout(
                    provider.refineAfterTest(request),
                    20_000,
                    `${provider.name} timeout`
                );
                return { ...result, provider: provider.name };
            } catch (error) {
                this.logger.warn(`Provider ${provider.name} refine failed: ${error.message}`);
            }
        }
        throw new Error('Tous les providers IA indisponibles');
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        for (const provider of this.providers) {
            try {
                return await this.withTimeout(
                    provider.chat(messages, systemPrompt),
                    10_000,
                    `${provider.name} timeout`
                );
            } catch (error) {
                this.logger.warn(`Provider ${provider.name} chat failed: ${error.message}`);
            }
        }
        throw new Error('Tous les providers IA indisponibles');
    }

    private getActiveProviders(): AIProviderInterface[] {
        // Un provider est "actif" s'il ne throw pas immédiatement sur analyze
        // On vérifie via la présence de la clé dans l'env
        return this.providers.filter(p => {
            if (p.name === 'openai')      return !!this.config.get('OPENAI_API_KEY');
            if (p.name === 'openrouter')  return !!this.config.get('OPENROUTER_API_KEY');
            if (p.name === 'claude')      return !!this.config.get('ANTHROPIC_API_KEY');
            if (p.name === 'gemini')      return !!this.config.get('GOOGLE_GEMINI_API_KEY');
            return false;
        });
    }

    private buildCacheKey(request: DiagnosticRequest): string {
        const keyData = {
            make:     request.vehicleContext.make,
            model:    request.vehicleContext.model,
            year:     request.vehicleContext.year,
            dtcs:     request.obdSnapshot?.dtcs.map(d => d.code).sort() ?? [],
            symptoms: request.symptoms.map(s => s.code).sort(),
        };
        const hash = createHash('sha256').update(JSON.stringify(keyData)).digest('hex').slice(0, 16);
        return `diag:cache:${hash}`;
    }

    private buildFallbackResponse(
        request: DiagnosticRequest,
        error: Error | null,
    ): DiagnosticResponse & { provider: string; cached: boolean } {
        const dtcs = request.obdSnapshot?.dtcs ?? [];
        const primaryDTC = dtcs[0];
        return {
            provider: 'fallback',
            cached:   false,
            primaryCause: primaryDTC
                ? `Code ${primaryDTC.code}: ${primaryDTC.description}`
                : 'Diagnostic IA temporairement indisponible',
            confidence:    primaryDTC ? 40 : 0,
            severity:      'medium',
            driveRisk:     'monitor',
            causes:        dtcs.map(dtc => ({
                description: `${dtc.code}: ${dtc.description}`,
                confidence:  40,
                severity:    'medium' as const,
                component:   null,
                suggestedParts: [],
            })),
            estimatedRepairCost: null,
            immediateActions:    ['Consultez un mécanicien professionnel'],
            explanation:         'Le service de diagnostic IA est temporairement indisponible.',
            technicalSummary:    `DTCs: ${dtcs.map(d => d.code).join(', ')}`,
            recommendedTests:    [],
        };
    }

    private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
        return Promise.race([
            promise,
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms)
            ),
        ]);
    }
}
