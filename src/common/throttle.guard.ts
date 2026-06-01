import {
    Injectable, CanActivate, ExecutionContext,
    HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';

/**
 * Rate limiter basé sur Redis.
 * Limite les appels IA à 10/minute par utilisateur (plan Pro)
 * et les autres endpoints à 60/minute.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
    private readonly logger = new Logger(RateLimitGuard.name);

    constructor(@InjectRedis() private readonly redis: Redis) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId  = request.user?.id ?? request.ip;
        const path    = request.path as string;

        const { limit, windowSeconds } = this.getLimits(path);
        const key = `ratelimit:${userId}:${path.split('/')[2] ?? 'general'}`;

        const current = await this.redis.incr(key);
        if (current === 1) {
            await this.redis.expire(key, windowSeconds);
        }

        if (current > limit) {
            this.logger.warn(`Rate limit exceeded: ${userId} on ${path} (${current}/${limit})`);
            throw new HttpException(
                {
                    statusCode: HttpStatus.TOO_MANY_REQUESTS,
                    message:    'Trop de requêtes. Réessayez dans quelques secondes.',
                    retryAfter: windowSeconds,
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        return true;
    }

    private getLimits(path: string): { limit: number; windowSeconds: number } {
        if (path.includes('/diagnostics/analyze')) {
            return { limit: 10, windowSeconds: 60 };   // 10 diagnostics/min
        }
        if (path.includes('/auth/login')) {
            return { limit: 5, windowSeconds: 300 };   // 5 tentatives/5min (anti-brute force)
        }
        if (path.includes('/auth/register')) {
            return { limit: 3, windowSeconds: 3600 };  // 3 inscriptions/heure par IP
        }
        return { limit: 60, windowSeconds: 60 };        // 60 req/min par défaut
    }
}
