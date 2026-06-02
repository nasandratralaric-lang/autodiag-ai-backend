import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    AIProviderInterface, DiagnosticRequest, DiagnosticResponse,
    TestRefinementRequest, ChatMessage,
} from '../ai.interface';
import { buildDiagnosticContext, DIAGNOSTIC_SYSTEM_PROMPT, EMERGENCY_SYSTEM_PROMPT } from '../ai.prompts';

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
        const isEmergency = (request as any).isEmergency;
        const systemPrompt = isEmergency ? EMERGENCY_SYSTEM_PROMPT : DIAGNOSTIC_SYSTEM_PROMPT;
        this.logger.log(`OpenRouter fetch → ${this.model} ${isEmergency ? '[MODE URGENCE]' : ''}`);
        const content = await this.callApi([
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: buildDiagnosticContext(request) },
        ], 1500);

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            this.logger.error(`Réponse non-JSON: ${content.slice(0, 500)}`);
            throw new Error('Aucun JSON dans la réponse OpenRouter');
        }

        let parsed: any;
        try {
            parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
            this.logger.error(`JSON invalide: ${jsonMatch[0].slice(0, 300)}`);
            throw new Error('JSON malformé depuis OpenRouter');
        }

        // Log partiel pour voir la structure en cas d'erreur
        this.logger.log(`OpenRouter réponse keys: ${Object.keys(parsed).join(', ')}`);

        // Normaliser les champs manquants plutôt que de rejeter
        const normalized = this.normalizeResponse(parsed);
        this.logger.log(`OpenRouter OK — cause: ${normalized.primaryCause?.slice(0, 60)}`);
        return normalized as DiagnosticResponse;
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse> {
        const hasObd2 = request.testResult.obdBefore || request.testResult.obdAfter;
        const obdContext = hasObd2
            ? `Données OBD2 avant: ${JSON.stringify(request.testResult.obdBefore)}. Après: ${JSON.stringify(request.testResult.obdAfter)}.`
            : `Aucune donnée OBD2 disponible (diagnostic sans capteur électronique).`;

        const userContent = `Test effectué : "${request.testResult.testTitle}".
Réponse de l'utilisateur : ${request.testResult.userResponse}.
${obdContext}
Affinez le diagnostic en tenant compte de ce résultat. Retournez le JSON mis à jour.`;

        const messages = [
            { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
            ...request.previousMessages.filter(m => m.role !== 'system'),
            { role: 'user', content: userContent },
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

    private normalizeResponse(data: any): DiagnosticResponse {
        // Certains modèles retournent des structures légèrement différentes
        // On normalise plutôt que de rejeter

        // Champs obligatoires avec fallback raisonnables
        const primaryCause = data.primaryCause
            || data.primary_cause
            || data.cause
            || data.diagnosis
            || (data.causes?.[0]?.description)
            || 'Cause à déterminer';

        const confidence = typeof data.confidence === 'number'
            ? data.confidence
            : parseInt(data.confidence) || 50;

        const driveRisk = data.driveRisk
            || data.drive_risk
            || data.riskToDrive
            || 'monitor';

        const severity = data.severity || 'medium';

        if (!data.primaryCause) {
            this.logger.warn(`Normalisation réponse: primaryCause manquant, utilise "${primaryCause}"`);
        }

        return {
            primaryCause,
            confidence,
            severity,
            driveRisk,
            causes:             data.causes            || [{ description: primaryCause, confidence, severity, component: null, suggestedParts: [] }],
            estimatedRepairCost:data.estimatedRepairCost || null,
            immediateActions:   data.immediateActions  || data.immediate_actions || [],
            explanation:        data.explanation        || primaryCause,
            technicalSummary:   data.technicalSummary  || data.technical_summary || primaryCause,
            recommendedTests:   data.recommendedTests   || data.recommended_tests || [],
        };
    }
}
