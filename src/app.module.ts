import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { OBD2Module } from './obd2/obd2.module';
import { AIModule } from './ai/ai.module';
import { HealthController } from './common/health.controller';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                // Neon/Supabase fournissent une DATABASE_URL complète.
                // En dev, on utilise les variables individuelles.
                const databaseUrl = config.get('DATABASE_URL');
                const isProd = config.get('NODE_ENV') === 'production';

                if (databaseUrl) {
                    return {
                        type: 'postgres',
                        url: databaseUrl,
                        autoLoadEntities: true,
                        synchronize: !isProd,
                        ssl: { rejectUnauthorized: false },
                    };
                }
                return {
                    type: 'postgres',
                    host:     config.get('DB_HOST'),
                    port:     config.get<number>('DB_PORT'),
                    database: config.get('DB_NAME'),
                    username: config.get('DB_USER'),
                    password: config.get('DB_PASSWORD'),
                    autoLoadEntities: true,
                    synchronize: !isProd,
                    ssl: isProd ? { rejectUnauthorized: false } : false,
                };
            },
        }),

        RedisModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                // Upstash fournit une REDIS_URL (rediss://...) avec TLS.
                const redisUrl = config.get('REDIS_URL');
                if (redisUrl) {
                    return { config: { url: redisUrl, tls: {} } };
                }
                return {
                    config: {
                        host:     config.get('REDIS_HOST', 'localhost'),
                        port:     config.get<number>('REDIS_PORT', 6379),
                        password: config.get('REDIS_PASSWORD'),
                    },
                };
            },
        }),

        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const redisUrl = config.get('REDIS_URL');
                if (redisUrl) {
                    return { url: redisUrl, redis: { tls: {} } };
                }
                return {
                    redis: {
                        host:     config.get('REDIS_HOST', 'localhost'),
                        port:     config.get<number>('REDIS_PORT', 6379),
                        password: config.get('REDIS_PASSWORD'),
                    },
                };
            },
        }),

        AuthModule,
        UsersModule,
        VehiclesModule,
        MaintenanceModule,
        DiagnosticsModule,
        OBD2Module,
        AIModule,
    ],
    controllers: [HealthController],
})
export class AppModule {}
