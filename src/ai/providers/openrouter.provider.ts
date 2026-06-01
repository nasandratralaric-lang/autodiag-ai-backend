import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    AIProviderInterface, DiagnosticRequest, DiagnosticResponse,
    TestRefinementRequest, ChatMessage,
} from '../ai.interface';
import { buildDiagnosticContext, DIAGNOSTIC_SYSTEM_PROMPT } from '../ai.prompts';

/**
 * Provider OpenRouter — utilise fetch() directement (pas le SDK OpenAI)
 * pour éviter tout problème d'injection de headers avec baseURL custom.
 */
@Injectable()
export class OpenRouterProvider implements AIProviderInterface {
    readonly name = 'openrouter';
    readonly model: string;
    private readonly logger = new Logger(OpenRouterProvider.name);
    private readonly apiKey: string | null = null;
    private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    constructor(private readonly config: ConfigService) {
        this.model = this.config.get<string>('OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free');

        const rawKey = this.config.get<string>('OPENROUTER_API_KEY');
        if (rawKey) {
            this.apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
            this.logger.log(`OpenRouter configuré — modèle: ${this.model}, clé: ${this.apiKey.slice(0, 15)}...`);
        } else {
            this.logger.warn('OPENROUTER_API_KEY non configurée — provider OpenRouter désactivé');
        }
    }

    async analyze(request: DiagnosticRequest): Promise<DiagnosticResponse> {
        this.logger.log(`OpenRouter fetch → ${this.model}`);
        const content = await this.callApi([
            { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
            { role: 'user',   content: buildDiagnosticContext(request) },
        ], 1500);

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            this.logger.error(`Réponse non-JSON: ${content.slice(0, 300)}`);
            throw new Error('Aucun JSON dans la réponse OpenRouter');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        this.validate(parsed);
        this.logger.log(`OpenRouter OK — cause: ${parsed.primaryCause?.slice(0, 60)}`);
        return parsed as DiagnosticResponse;
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse> {
        const messages = [
            { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
            ...request.previousMessages.filter(m => m.role !== 'system'),
            {
                role: 'user',
                content: `Test "${request.testResult.testTitle}". Réponse: ${request.testResult.userResponse}. Affinez en JSON.`,
            },
        ];
        const content = await this.callApi(messages, 1500);
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Aucun JSON OpenRouter refine');
        return JSON.parse(jsonMatch[0]);
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        const msgs = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;
        return this.callApi(msgs, 800);
    }

    estimateTokens(request: DiagnosticRequest): number {
        return Math.ceil(buildDiagnosticContext(request).length / 4) + 600;
    }

    get isConfigured(): boolean { return this.apiKey !== null; }

    // ─── Appel HTTP direct — pas de SDK ───────────────────────────────────────

    private async callApi(messages: any[], maxTokens: number, attempt = 1): Promise<string> {
        if (!this.apiKey) throw new Error('OPENROUTER_API_KEY manquante');

        this.logger.log(`→ POST OpenRouter (tentative ${attempt}) model: ${this.model}`);

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type':  'application/json',
                'HTTP-Referer':  'https://autodiag.mg',
                'X-Title':       'AutoDiag AI Madagascar',
            },
            body: JSON.stringify({
                model:       this.model,
                messages,
                temperature: 0.3,
                max_tokens:  maxTokens,
            }),
            signal: AbortSignal.timeout(180_000),
        });

        const data: any = await response.json();

        // 429 Rate Limited — attendre et réessayer
        if (response.status === 429) {
            const retryAfter = data?.error?.metadata?.retry_after_seconds ?? 15;
            if (attempt <= 3) {
                this.logger.warn(`OpenRouter 429 rate-limited — attente ${retryAfter}s puis retry (${attempt}/3)`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return this.callApi(messages, maxTokens, attempt + 1);
            }
            throw new Error(`OpenRouter rate-limited après 3 tentatives`);
        }

        if (!response.ok) {
            this.logger.error(`OpenRouter HTTP ${response.status}: ${JSON.stringify(data)}`);
            throw new Error(`OpenRouter ${response.status}: ${data?.error?.message ?? JSON.stringify(data)}`);
        }

        if (data.error) {
            this.logger.error(`OpenRouter erreur: ${JSON.stringify(data.error)}`);
            throw new Error(`OpenRouter model error: ${data.error.message}`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            this.logger.error(`OpenRouter vide: ${JSON.stringify(data)}`);
            throw new Error('Réponse vide de OpenRouter');
        }

        return content;
    }

    private validate(data: unknown): void {
        const d = data as DiagnosticResponse;
        if (!d.primaryCause || typeof d.confidence !== 'number' || !d.driveRisk) {
            throw new Error('Structure de réponse invalide depuis OpenRouter');
        }
    }
}
