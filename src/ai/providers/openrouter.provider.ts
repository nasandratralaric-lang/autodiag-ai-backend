import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
    AIProviderInterface, DiagnosticRequest, DiagnosticResponse,
    TestRefinementRequest, ChatMessage,
} from '../ai.interface';
import { buildDiagnosticContext, DIAGNOSTIC_SYSTEM_PROMPT } from '../ai.prompts';

/**
 * Provider OpenRouter — API compatible OpenAI, accès aux modèles gratuits.
 * Configuration : OPENROUTER_API_KEY + OPENROUTER_MODEL (optionnel)
 *
 * Modèles gratuits recommandés sur OpenRouter :
 *   meta-llama/llama-3.3-70b-instruct:free
 *   openai/gpt-4o-mini:free (si disponible)
 *   mistralai/mistral-7b-instruct:free
 *   nousresearch/hermes-3-llama-3.1-405b:free
 *
 * La valeur de OPENROUTER_MODEL doit correspondre exactement à l'ID du modèle
 * tel qu'affiché sur openrouter.ai/models
 */
@Injectable()
export class OpenRouterProvider implements AIProviderInterface {
    readonly name = 'openrouter';
    readonly model: string;
    private readonly logger = new Logger(OpenRouterProvider.name);
    private client: OpenAI | null = null;

    constructor(private readonly config: ConfigService) {
        const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
        // Modèle configurable — mettre l'ID exact depuis openrouter.ai/models
        this.model = this.config.get<string>('OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free');

        if (apiKey) {
            this.client = new OpenAI({
                apiKey,
                baseURL: 'https://openrouter.ai/api/v1',
                timeout: 90_000,  // 90s — gros modèle free peut être lent
                defaultHeaders: {
                    'HTTP-Referer': 'https://autodiag.mg',
                    'X-Title':      'AutoDiag AI Madagascar',
                },
            });
            this.logger.log(`OpenRouter configuré avec le modèle : ${this.model}`);
        } else {
            this.logger.warn('OPENROUTER_API_KEY non configurée — provider OpenRouter désactivé');
        }
    }

    async analyze(request: DiagnosticRequest): Promise<DiagnosticResponse> {
        const client = this.requireClient();
        this.logger.log(`OpenRouter → model: ${this.model}`);

        let response: OpenAI.Chat.ChatCompletion;
        try {
            response = await client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
                    { role: 'user',   content: buildDiagnosticContext(request) },
                ],
                temperature: 0.3,
                max_tokens: 1500,   // réduit pour accélérer la réponse
                // Pas de response_format JSON car non supporté par tous les modèles OpenRouter
            });
        } catch (err: any) {
            this.logger.error(`OpenRouter API error: ${err.status} — ${err.message}`);
            if (err.error) this.logger.error(`OpenRouter detail: ${JSON.stringify(err.error)}`);
            throw err;
        }

        // Vérifier si OpenRouter renvoie une erreur dans le corps
        const raw = response as any;
        if (raw.error) {
            throw new Error(`OpenRouter model error: ${raw.error.message || JSON.stringify(raw.error)}`);
        }

        const content = response.choices[0]?.message?.content;
        if (!content) {
            this.logger.error(`OpenRouter vide. finish_reason: ${response.choices[0]?.finish_reason}, usage: ${JSON.stringify(response.usage)}`);
            throw new Error(`Réponse vide de OpenRouter (finish_reason: ${response.choices[0]?.finish_reason})`);
        }

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            this.logger.error(`OpenRouter réponse non-JSON: ${content.slice(0, 200)}`);
            throw new Error('Aucun JSON dans la réponse OpenRouter');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        this.validate(parsed);
        this.logger.log(`OpenRouter OK — cause: ${parsed.primaryCause?.slice(0, 60)}`);
        return parsed as DiagnosticResponse;
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse> {
        const client = this.requireClient();
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
            ...request.previousMessages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            {
                role: 'user',
                content: `Test "${request.testResult.testTitle}" — Réponse: ${request.testResult.userResponse}. ` +
                    `Données OBD2 après: ${JSON.stringify(request.testResult.obdAfter)}. ` +
                    `Affinez le diagnostic en JSON.`,
            },
        ];

        const response = await client.chat.completions.create({
            model: this.model,
            messages,
            temperature: 0.3,
            max_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content ?? '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Aucun JSON dans la réponse OpenRouter (refine)');
        return JSON.parse(jsonMatch[0]);
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        const client = this.requireClient();
        const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt });
        openaiMessages.push(...messages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
        })));

        const response = await client.chat.completions.create({
            model: this.model,
            messages: openaiMessages,
            temperature: 0.7,
            max_tokens: 1000,
        });
        return response.choices[0]?.message?.content ?? '';
    }

    estimateTokens(request: DiagnosticRequest): number {
        return Math.ceil(buildDiagnosticContext(request).length / 4) + 600;
    }

    get isConfigured(): boolean {
        return this.client !== null;
    }

    private requireClient(): OpenAI {
        if (!this.client) throw new Error('OPENROUTER_API_KEY manquante');
        return this.client;
    }

    private validate(data: unknown): void {
        const d = data as DiagnosticResponse;
        if (!d.primaryCause || typeof d.confidence !== 'number' || !d.driveRisk) {
            throw new Error('Structure de réponse invalide depuis OpenRouter');
        }
    }
}
