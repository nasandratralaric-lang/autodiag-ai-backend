import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        @InjectRedis() private readonly redis: Redis,
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

    private async checkDatabase(): Promise<void> {
        await this.db.query('SELECT 1');
    }

    private async checkRedis(): Promise<void> {
        await this.redis.ping();
    }
}
