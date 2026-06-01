import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
    AIProviderInterface, DiagnosticRequest, DiagnosticResponse,
    TestRefinementRequest, ChatMessage,
} from '../ai.interface';
import { buildDiagnosticContext, DIAGNOSTIC_SYSTEM_PROMPT } from '../ai.prompts';

@Injectable()
export class ClaudeProvider implements AIProviderInterface {
    readonly name = 'claude';
    readonly model = 'claude-sonnet-4-6';
    private readonly logger = new Logger(ClaudeProvider.name);
    private readonly client: Anthropic;

    constructor(private readonly config: ConfigService) {
        this.client = new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY') });
    }

    async analyze(request: DiagnosticRequest): Promise<DiagnosticResponse> {
        const userContext = buildDiagnosticContext(request);

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 2000,
            system: DIAGNOSTIC_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userContext }],
        });

        const content = response.content[0];
        if (content.type !== 'text') throw new Error('Unexpected Claude response type');

        // Extraire le JSON de la réponse (Claude peut ajouter du texte avant/après)
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in Claude response');

        return JSON.parse(jsonMatch[0]) as DiagnosticResponse;
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse> {
        const messages: Anthropic.MessageParam[] = [
            ...request.previousMessages
                .filter(m => m.role !== 'system')
                .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            {
                role: 'user',
                content: `Résultat du test: ${request.testResult.userResponse}. ` +
                    `Données OBD2 après: ${JSON.stringify(request.testResult.obdAfter)}. ` +
                    `Affinez le diagnostic en JSON.`,
            },
        ];

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 2000,
            system: DIAGNOSTIC_SYSTEM_PROMPT,
            messages,
        });

        const text = (response.content[0] as Anthropic.TextBlock).text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in Claude refine response');
        return JSON.parse(jsonMatch[0]);
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        const response = await this.client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            system: systemPrompt,
            messages: messages
                .filter(m => m.role !== 'system')
                .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        });
        return (response.content[0] as Anthropic.TextBlock).text;
    }

    estimateTokens(request: DiagnosticRequest): number {
        return Math.ceil(buildDiagnosticContext(request).length / 4) + 600;
    }
}
