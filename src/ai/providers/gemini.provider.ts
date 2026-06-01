import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    AIProviderInterface, DiagnosticRequest, DiagnosticResponse,
    TestRefinementRequest, ChatMessage,
} from '../ai.interface';
import { buildDiagnosticContext, DIAGNOSTIC_SYSTEM_PROMPT } from '../ai.prompts';

@Injectable()
export class GeminiProvider implements AIProviderInterface {
    readonly name = 'gemini';
    readonly model = 'gemini-1.5-flash';
    private readonly logger = new Logger(GeminiProvider.name);
    private readonly genAI: GoogleGenerativeAI;

    constructor(private readonly config: ConfigService) {
        this.genAI = new GoogleGenerativeAI(this.config.get('GOOGLE_GEMINI_API_KEY') ?? '');
    }

    async analyze(request: DiagnosticRequest): Promise<DiagnosticResponse> {
        const model = this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: DIAGNOSTIC_SYSTEM_PROMPT,
            generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
        });

        const result = await model.generateContent(buildDiagnosticContext(request));
        const text = result.response.text();
        return JSON.parse(text) as DiagnosticResponse;
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse> {
        const model = this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: DIAGNOSTIC_SYSTEM_PROMPT,
            generationConfig: { responseMimeType: 'application/json' },
        });

        const history = request.previousMessages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(
            `Test: ${request.testResult.testTitle}. Réponse: ${request.testResult.userResponse}. Affinez.`
        );
        return JSON.parse(result.response.text());
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        const model = this.genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: systemPrompt,
        });
        const last = messages[messages.length - 1];
        const result = await model.generateContent(last?.content ?? '');
        return result.response.text();
    }

    estimateTokens(request: DiagnosticRequest): number {
        return Math.ceil(buildDiagnosticContext(request).length / 4) + 600;
    }
}
