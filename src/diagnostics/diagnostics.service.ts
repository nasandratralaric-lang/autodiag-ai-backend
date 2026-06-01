import {
    Injectable, NotFoundException, ForbiddenException,
    BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIService } from '../ai/ai.service';
import { DiagnosticRequest } from '../ai/ai.interface';
import { DiagnosticSession, DiagnosticMessage, DiagnosticTest } from './entities/diagnostic-session.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { MaintenanceService } from '../maintenance/maintenance.service';

export interface StartDiagnosticDto {
    vehicleId: string;
    userId: string;
    symptoms: { code: string; label: string; severity: number }[];
    recentWorks: { type: string; description: string; date?: string }[];
    userDescription: string;
    obdSnapshot?: Record<string, any>;
    obd2SessionId?: string;
}

export interface SubmitTestResultDto {
    sessionId: string;
    userId: string;
    testId: string;
    userResponse: string;
    obdAfter?: Record<string, any>;
}

@Injectable()
export class DiagnosticsService {
    private readonly logger = new Logger(DiagnosticsService.name);

    constructor(
        @InjectRepository(DiagnosticSession)
        private readonly sessions: Repository<DiagnosticSession>,
        @InjectRepository(DiagnosticMessage)
        private readonly messages: Repository<DiagnosticMessage>,
        @InjectRepository(DiagnosticTest)
        private readonly tests: Repository<DiagnosticTest>,
        @InjectRepository(Vehicle)
        private readonly vehicles: Repository<Vehicle>,
        private readonly aiService: AIService,
        private readonly maintenanceService: MaintenanceService,
    ) {}

    async startDiagnostic(dto: StartDiagnosticDto): Promise<DiagnosticSession> {
        // 1. Charger le véhicule (avec vérification propriété)
        const vehicle = await this.vehicles.findOne({ where: { id: dto.vehicleId } });
        if (!vehicle) throw new NotFoundException('Véhicule non trouvé');
        if (vehicle.userId !== dto.userId) throw new ForbiddenException();

        // 2. Créer la session
        const session = await this.sessions.save(
            this.sessions.create({
                vehicleId: dto.vehicleId,
                userId: dto.userId,
                obd2SessionId: dto.obd2SessionId ?? null,
                status: 'in_progress',
                symptoms: dto.symptoms,
                recentWorks: dto.recentWorks,
                userDescription: dto.userDescription ?? null,
                obdSnapshot: dto.obdSnapshot ?? null,
            })
        );

        // 3. Charger l'historique d'entretien (24 derniers mois → contexte IA)
        const maintenanceHistory = await this.maintenanceService
            .getAIContextSummary(dto.vehicleId)
            .catch(() => []);

        this.logger.log(
            `Diagnostic ${session.id} — ${maintenanceHistory.length} entrées d'entretien chargées pour ${vehicle.make} ${vehicle.model}`
        );

        // 4. Assembler le contexte IA
        const context = await this.buildDiagnosticRequest(vehicle, dto, maintenanceHistory);

        // 4. Appeler l'IA
        let aiResult: any;
        try {
            aiResult = await this.aiService.analyze(context);
        } catch (error) {
            await this.sessions.update(session.id, { status: 'cancelled' });
            throw new BadRequestException(`Diagnostic IA indisponible: ${error.message}`);
        }

        // 5. Persister le résultat et les tests recommandés
        const testsToCreate = (aiResult.recommendedTests ?? []).map((t: any, idx: number) =>
            this.tests.create({
                sessionId: session.id,
                sequenceOrder: idx,
                title: t.title,
                instructions: t.instructions,
                preconditions: t.preconditions ?? [],
                estimatedDurationSeconds: t.estimatedDurationSeconds ?? 60,
                risks: t.risks ?? [],
                pidsMonitored: t.pidsToMonitor ?? [],
                status: 'pending',
            })
        );

        if (testsToCreate.length > 0) {
            await this.tests.save(testsToCreate);
        }

        const updated = await this.sessions.save({
            ...session,
            status:       'completed',
            primaryCause: aiResult.primaryCause,
            confidence:   aiResult.confidence,
            severity:     aiResult.severity,
            driveRisk:    aiResult.driveRisk,
            aiProvider:   aiResult.provider,
            result:       aiResult,
        });

        this.logger.log(
            `Diagnostic ${session.id}: ${aiResult.primaryCause} ` +
            `(${aiResult.confidence}%, risk=${aiResult.driveRisk}, provider=${aiResult.provider})`
        );

        return this.findSession(session.id, dto.userId);
    }

    async submitTestResult(dto: SubmitTestResultDto): Promise<DiagnosticSession> {
        const session = await this.findSession(dto.sessionId, dto.userId);
        const test = await this.tests.findOne({ where: { id: dto.testId, sessionId: dto.sessionId } });
        if (!test) throw new NotFoundException('Test non trouvé');

        // Mettre à jour le test
        await this.tests.save({
            ...test,
            status: 'completed',
            userResponse: dto.userResponse,
            obdDataAfter: dto.obdAfter ?? null,
            completedAt: new Date(),
        });

        // Construire l'historique de conversation pour l'affinage
        const history = await this.messages.find({
            where: { sessionId: dto.sessionId },
            order: { createdAt: 'ASC' },
        });

        // Affiner le diagnostic avec l'IA
        const refined = await this.aiService.refineAfterTest({
            sessionId: dto.sessionId,
            previousMessages: history.map(m => ({ role: m.role as any, content: m.content })),
            testResult: {
                testTitle:    test.title,
                userResponse: dto.userResponse,
                obdBefore:    test.obdDataBefore as any,
                obdAfter:     dto.obdAfter as any ?? null,
            },
            currentHypothesis: session.result as any,
        });

        // Sauvegarder le message de résultat
        await this.messages.save(this.messages.create({
            sessionId: dto.sessionId,
            role: 'assistant',
            content: refined.explanation,
            messageType: 'test_result',
            metadata: { testId: dto.testId, refinedResult: refined },
        }));

        // Mettre à jour le résultat principal
        await this.sessions.save({
            ...session,
            primaryCause: refined.primaryCause,
            confidence:   refined.confidence,
            severity:     refined.severity,
            driveRisk:    refined.driveRisk,
            result:       { ...refined, provider: refined.provider },
        });

        return this.findSession(dto.sessionId, dto.userId);
    }

    async submitFeedback(
        sessionId: string, userId: string,
        repairDone: boolean, repairDescription: string, resolved: boolean,
    ): Promise<void> {
        const session = await this.findSession(sessionId, userId);
        await this.sessions.update(session.id, {
            repairDone,
            repairDescription,
            repairResolved: resolved,
            feedbackAt: new Date(),
        });

        this.logger.log(
            `Feedback on ${sessionId}: repaired=${repairDone}, resolved=${resolved}`
        );
    }

    async findSession(sessionId: string, userId: string): Promise<DiagnosticSession> {
        const session = await this.sessions.findOne({
            where: { id: sessionId },
            relations: ['tests'],
        });
        if (!session) throw new NotFoundException('Session de diagnostic non trouvée');
        if (session.userId !== userId) throw new ForbiddenException();
        return session;
    }

    private async buildDiagnosticRequest(
        vehicle: Vehicle,
        dto: StartDiagnosticDto,
        maintenanceHistory: any[] = [],
    ): Promise<DiagnosticRequest> {
        // Charger les 5 derniers diagnostics du véhicule pour la mémoire long terme
        const previousDiagnostics = await this.sessions
            .find({
                where: { vehicleId: dto.vehicleId, status: 'completed' },
                order: { createdAt: 'DESC' },
                take: 5,
            })
            .then(sessions => sessions
                .filter(s => s.primaryCause)
                .map(s => ({
                    date:          s.createdAt.toISOString().split('T')[0],
                    primaryCause:  s.primaryCause,
                    repair:        s.repairDescription ?? null,
                    resolved:      s.repairResolved ?? null,
                }))
            )
            .catch(() => []);

        return {
            vehicleContext: {
                make:                 vehicle.make,
                model:                vehicle.model,
                year:                 vehicle.year ?? 2000,
                fuelType:             vehicle.fuelType ?? 'petrol',
                engineCode:           vehicle.engineCode ?? null,
                engineDisplacementCc: vehicle.engineDisplacementCc ?? null,
                mileageKm:            vehicle.mileageKm,
                vin:                  vehicle.vin ?? null,
            },
            maintenanceHistory,        // ← historique entretien réel
            symptoms:                  dto.symptoms,
            recentWorks:               dto.recentWorks.map(w => ({ ...w, date: w.date ?? null })),
            userDescription:           dto.userDescription,
            obdSnapshot:               dto.obdSnapshot as any ?? null,
            previousDiagnostics,       // ← diagnostics précédents du même véhicule
        };
    }
}
