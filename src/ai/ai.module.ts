import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { OpenAIProvider } from './providers/openai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';

@Module({
    providers: [AIService, OpenAIProvider, OpenRouterProvider, ClaudeProvider, GeminiProvider],
    exports: [AIService],
})
export class AIModule {}
