import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        @InjectRedis() private readonly redis: Redis,
        private readonly config: ConfigService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Health check' })
    async check() {
        const checks = await Promise.allSettled([
            this.checkDatabase(),
            this.checkRedis(),
        ]);

        const [db, cache] = checks;
        const allHealthy = checks.every(c => c.status === 'fulfilled');

        return {
            status:    allHealthy ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            version:   process.env.npm_package_version ?? '0.1.0',
            services: {
                database: db.status === 'fulfilled'  ? 'ok' : 'error',
                cache:    cache.status === 'fulfilled'? 'ok' : 'error',
            },
        };
    }

    @Get('ping')
    ping() { return { pong: true }; }

    @Get('ai-test')
    @ApiOperation({ summary: 'Test rapide du provider IA actif' })
    async testAI() {
        const model   = this.config.get('OPENROUTER_MODEL', 'non configuré');
        const hasKey  = !!this.config.get('OPENROUTER_API_KEY');
        const hasOAI  = !!this.config.get('OPENAI_API_KEY');

        // Test direct OpenRouter
        let openrouterResult: any = 'non testé';
        if (hasKey) {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.config.get('OPENROUTER_API_KEY')}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://autodiag.mg',
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: 'Réponds juste "ok"' }],
                        max_tokens: 10,
                    }),
                });
                const data: any = await res.json();
                if (data.error) {
                    openrouterResult = `ERREUR: ${data.error.message}`;
                } else {
                    openrouterResult = `OK — ${data.choices?.[0]?.message?.content}`;
                }
            } catch (e: any) {
                openrouterResult = `EXCEPTION: ${e.message}`;
            }
        }

        return {
            openai_configured:     hasOAI,
            openrouter_configured: hasKey,
            openrouter_model:      model,
            openrouter_test:       openrouterResult,
        };
    }

    private async checkDatabase(): Promise<void> {
        await this.db.query('SELECT 1');
    }

    private async checkRedis(): Promise<void> {
        await this.redis.ping();
    }
}
