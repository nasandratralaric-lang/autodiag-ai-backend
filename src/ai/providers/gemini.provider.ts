import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
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
        const model = this.getModel();
        const prompt = `${DIAGNOSTIC_SYSTEM_PROMPT}\n\n${buildDiagnosticContext(request)}\n\nRéponds en JSON valide uniquement.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in Gemini response');
        return JSON.parse(jsonMatch[0]) as DiagnosticResponse;
    }

    async refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse> {
        const model = this.getModel();
        const prompt = `${DIAGNOSTIC_SYSTEM_PROMPT}\n\nTest: ${request.testResult.testTitle}.\nRéponse: ${request.testResult.userResponse}.\nAffinez le diagnostic en JSON.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in Gemini refine response');
        return JSON.parse(jsonMatch[0]);
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        const model = this.getModel();
        const last = messages[messages.length - 1];
        const prompt = systemPrompt ? `${systemPrompt}\n\n${last?.content ?? ''}` : (last?.content ?? '');
        const result = await model.generateContent(prompt);
        return result.response.text();
    }

    estimateTokens(request: DiagnosticRequest): number {
        return Math.ceil(buildDiagnosticContext(request).length / 4) + 600;
    }

    private getModel(): GenerativeModel {
        return this.genAI.getGenerativeModel({ model: this.model });
    }
}
