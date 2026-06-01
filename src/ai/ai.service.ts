import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import {
    AIProviderInterface,
    DiagnosticRequest,
    DiagnosticResponse,
    TestRefinementRequest,
    ChatMessage,
} from './ai.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';

@Injectable()
export class AIService {
    private readonly logger = new Logger(AIService.name);
    private readonly providers: AIProviderInterface[];
    private readonly CACHE_TTL_SECONDS = 3600; // 1 heure

    constructor(
        private readonly config: ConfigService,
        private readonly openai: OpenAIProvider,
        private readonly claude: ClaudeProvider,
        private readonly gemini: GeminiProvider,
        @InjectRedis() private readonly redis: Redis,
    ) {
        // Ordre de priorité: OpenAI → Claude → Gemini
        this.providers = [openai, claude, gemini];
    }

    async analyze(request: DiagnosticRequest): Promise<DiagnosticResponse & { provider: string; cached: boolean }> {
        const cacheKey = this.buildCacheKey(request);

        // Vérifier le cache
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            this.logger.log('Cache hit for diagnostic request');
            return { ...JSON.parse(cached), cached: true, provider: 'cache' };
        }

        // Essayer chaque provider dans l'ordre
        let lastError: Error | null = null;
        for (const provider of this.providers) {
            try {
                this.logger.log(`Trying provider: ${provider.name} (${provider.model})`);
                const result = await this.withTimeout(
                    provider.analyze(request),
                    15_000,
                    `${provider.name} timeout`
                );

                // Mettre en cache le résultat
                await this.redis.setex(cacheKey, this.CACHE_TTL_SECONDS, JSON.stringify(result));

                return { ...result, provider: provider.name, cached: false };
            } catch (error) {
                this.logger.warn(`Provider ${provider.name} failed: ${error.message}`);
                lastError = error;
                continue;
            }
        }

        // Fallback: réponse basée sur le catalogue DTC
        this.logger.error('All AI providers failed, using DTC fallback');
        return this.buildFallbackResponse(request, lastError);
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse & { provider: string }> {
        for (const provider of this.providers) {
            try {
                const result = await this.withTimeout(
                    provider.refineAfterTest(request),
                    15_000,
                    `${provider.name} timeout`
                );
                return { ...result, provider: provider.name };
            } catch (error) {
                this.logger.warn(`Provider ${provider.name} failed on refine: ${error.message}`);
            }
        }
        throw new Error('All AI providers failed for test refinement');
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
        throw new Error('All AI providers unavailable');
    }

    private buildCacheKey(request: DiagnosticRequest): string {
        // Cache basé sur : véhicule + codes DTC + symptômes principaux
        const keyData = {
            make: request.vehicleContext.make,
            model: request.vehicleContext.model,
            year: request.vehicleContext.year,
            dtcs: request.obdSnapshot?.dtcs.map(d => d.code).sort() ?? [],
            symptoms: request.symptoms.map(s => s.code).sort(),
        };
        const hash = createHash('sha256').update(JSON.stringify(keyData)).digest('hex').slice(0, 16);
        return `diag:cache:${hash}`;
    }

    private buildFallbackResponse(request: DiagnosticRequest, error: Error | null): DiagnosticResponse & { provider: string; cached: boolean } {
        const dtcs = request.obdSnapshot?.dtcs ?? [];
        const primaryDTC = dtcs[0];

        return {
            provider: 'fallback',
            cached: false,
            primaryCause: primaryDTC
                ? `Code ${primaryDTC.code}: ${primaryDTC.description}`
                : 'Diagnostic IA temporairement indisponible',
            confidence: primaryDTC ? 40 : 0,
            severity: 'medium',
            driveRisk: 'monitor',
            causes: dtcs.map(dtc => ({
                description: `${dtc.code}: ${dtc.description}`,
                confidence: 40,
                severity: 'medium' as const,
                component: null,
                suggestedParts: [],
            })),
            estimatedRepairCost: null,
            immediateActions: ['Consultez un mécanicien professionnel'],
            explanation: 'Le service de diagnostic IA est temporairement indisponible. Veuillez consulter un mécanicien.',
            technicalSummary: `DTCs présents: ${dtcs.map(d => d.code).join(', ')}`,
            recommendedTests: [],
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
