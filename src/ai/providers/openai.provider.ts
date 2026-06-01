import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
    AIProviderInterface,
    DiagnosticRequest,
    DiagnosticResponse,
    TestRefinementRequest,
    ChatMessage,
} from '../ai.interface';
import { buildDiagnosticContext, DIAGNOSTIC_SYSTEM_PROMPT, DIAGNOSTIC_RESPONSE_SCHEMA } from '../ai.prompts';

@Injectable()
export class OpenAIProvider implements AIProviderInterface {
    readonly name = 'openai';
    readonly model = 'gpt-4o';
    private readonly logger = new Logger(OpenAIProvider.name);
    private readonly client: OpenAI;

    constructor(private readonly config: ConfigService) {
        this.client = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
    }

    async analyze(request: DiagnosticRequest): Promise<DiagnosticResponse> {
        const userContext = buildDiagnosticContext(request);

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
                { role: 'user', content: userContext },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from OpenAI');

        const parsed = JSON.parse(content);
        this.validateResponse(parsed);
        return parsed as DiagnosticResponse;
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse> {
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
            ...request.previousMessages.map(m => ({
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content,
            })),
            {
                role: 'user',
                content: `Résultat du test "${request.testResult.testTitle}":
Réponse utilisateur: ${request.testResult.userResponse}

Données OBD2 avant le test:
${request.testResult.obdBefore ? JSON.stringify(request.testResult.obdBefore, null, 2) : 'Non disponible'}

Données OBD2 après le test:
${request.testResult.obdAfter ? JSON.stringify(request.testResult.obdAfter, null, 2) : 'Non disponible'}

Veuillez affiner votre diagnostic en tenant compte de ces résultats. Retournez le diagnostic mis à jour au format JSON.`,
            },
        ];

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from OpenAI');
        return JSON.parse(content) as DiagnosticResponse;
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt });
        openaiMessages.push(...messages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
        })));

        const response = await this.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: openaiMessages,
            temperature: 0.7,
            max_tokens: 1000,
        });
        return response.choices[0]?.message?.content ?? '';
    }

    estimateTokens(request: DiagnosticRequest): number {
        const context = buildDiagnosticContext(request);
        return Math.ceil(context.length / 4) + 600; // rough estimate
    }

    private validateResponse(data: unknown): void {
        const d = data as DiagnosticResponse;
        if (!d.primaryCause || typeof d.confidence !== 'number' || !d.driveRisk) {
            throw new Error('Invalid diagnostic response structure from OpenAI');
        }
    }
}
