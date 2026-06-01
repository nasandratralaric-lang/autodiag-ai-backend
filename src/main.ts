import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/logging.interceptor';

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug'],
    });

    // Préfixe global
    app.setGlobalPrefix('api');

    // CORS
    app.enableCors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
    });

    // Validation automatique des DTOs
    app.useGlobalPipes(new ValidationPipe({
        whitelist:            true,
        transform:            true,
        forbidNonWhitelisted: true,
        transformOptions:     { enableImplicitConversion: true },
    }));

    // Logging structuré
    app.useGlobalInterceptors(new LoggingInterceptor());

    // Swagger (désactivé en production)
    if (process.env.NODE_ENV !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('AutoDiag AI API')
            .setDescription('API backend pour AutoDiag AI Madagascar')
            .setVersion('0.1.0')
            .addBearerAuth()
            .addTag('auth', 'Authentification')
            .addTag('users', 'Profils utilisateurs')
            .addTag('vehicles', 'Gestion des véhicules')
            .addTag('obd2', 'Sessions OBD2')
            .addTag('diagnostics', 'Diagnostic IA')
            .addTag('maintenance', 'Carnet d\'entretien')
            .addTag('health', 'Health checks')
            .build();
        SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
        logger.log('Swagger disponible sur /docs');
    }

    // Graceful shutdown
    app.enableShutdownHooks();

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    logger.log(`AutoDiag AI API démarré sur le port ${port} [${process.env.NODE_ENV ?? 'development'}]`);
}

bootstrap().catch(err => {
    console.error('Erreur fatale au démarrage:', err);
    process.exit(1);
});
