import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiagnosticSession } from '../diagnostics/entities/diagnostic-session.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User } from '../users/entities/user.entity';

interface KnowledgeEntry {
    make: string;
    model: string;
    yearMin: number;
    yearMax: number;
    fuelType: string;
    dtcCode: string;
    confirmedCause: string;
    avgRepairCost: number | null;
    currency: string;
    occurrenceCount: number;
    resolutionRate: number;
}

/**
 * Agrège les diagnostics résolus (avec consentement) pour enrichir
 * la base de connaissances locale — améliore les diagnostics futurs.
 */
@Injectable()
export class KnowledgeService {
    private readonly logger = new Logger(KnowledgeService.name);

    constructor(
        @InjectRepository(DiagnosticSession)
        private readonly sessions: Repository<DiagnosticSession>,
        @InjectRepository(Vehicle)
        private readonly vehicles: Repository<Vehicle>,
        @InjectRepository(User)
        private readonly users: Repository<User>,
    ) {}

    /**
     * Agrège un diagnostic résolu dans la base de connaissances.
     * Appelé uniquement si l'utilisateur a donné son consentement au partage.
     */
    async aggregateResolvedDiagnostic(sessionId: string): Promise<void> {
        const session = await this.sessions.findOne({ where: { id: sessionId } });
        if (!session?.repairResolved || !session.primaryCause) return;

        const user = await this.users.findOne({ where: { id: session.userId } });
        if (!user?.consentDataSharing) return; // Respect du consentement RGPD

        const vehicle = await this.vehicles.findOne({ where: { id: session.vehicleId } });
        if (!vehicle) return;

        // Extraire les codes DTC du snapshot OBD2
        const dtcs = (session.obdSnapshot as any)?.dtcs ?? [];

        for (const dtc of dtcs) {
            await this.upsertKnowledgeEntry({
                make:            vehicle.make,
                model:           vehicle.model,
                yearMin:         (vehicle.year ?? 2000) - 2,
                yearMax:         (vehicle.year ?? 2030) + 2,
                fuelType:        vehicle.fuelType ?? 'petrol',
                dtcCode:         dtc.code,
                confirmedCause:  session.primaryCause,
                avgRepairCost:   this.extractRepairCost(session),
                currency:        'MGA',
                occurrenceCount: 1,
                resolutionRate:  session.repairResolved ? 100 : 0,
            });
        }

        this.logger.log(
            `Knowledge aggregated: ${vehicle.make} ${vehicle.model} ` +
            `— ${dtcs.map((d: any) => d.code).join(', ')} → ${session.primaryCause}`
        );
    }

    /**
     * Récupère les statistiques de panne pour un véhicule et un DTC donné.
     * Injecté dans le contexte IA pour améliorer la précision locale.
     */
    async getLocalStats(make: string, model: string, year: number, dtcCode: string): Promise<{
        frequency: number;
        topCause: string | null;
        avgCost: number | null;
        resolutionRate: number;
    }> {
        const result = await this.sessions
            .createQueryBuilder('s')
            .innerJoin(Vehicle, 'v', 'v.id = s.vehicleId')
            .where('v.make ILIKE :make', { make: `%${make}%` })
            .andWhere('v.model ILIKE :model', { model: `%${model}%` })
            .andWhere('s.primaryCause IS NOT NULL')
            .andWhere("s.obdSnapshot::text LIKE :dtc", { dtc: `%${dtcCode}%` })
            .andWhere('s.repairResolved IS NOT NULL')
            .select('s.primaryCause', 'cause')
            .addSelect('COUNT(*)', 'count')
            .addSelect('AVG(CASE WHEN s.repairResolved = true THEN 100 ELSE 0 END)', 'resolutionRate')
            .groupBy('s.primaryCause')
            .orderBy('count', 'DESC')
            .limit(1)
            .getRawOne();

        if (!result) {
            return { frequency: 0, topCause: null, avgCost: null, resolutionRate: 0 };
        }

        return {
            frequency:      parseInt(result.count ?? '0'),
            topCause:       result.cause,
            avgCost:        null, // À implémenter avec les données de coût
            resolutionRate: parseFloat(result.resolutionRate ?? '0'),
        };
    }

    /**
     * Génère une phrase de contexte local pour le prompt IA.
     * Ex: "Sur 23 Toyota Corolla similaires à Madagascar, P0301 est causé à 78% par une bobine défectueuse."
     */
    async buildLocalContextSentence(
        make: string, model: string, year: number, dtcCode: string,
    ): Promise<string | null> {
        const stats = await this.getLocalStats(make, model, year, dtcCode);
        if (stats.frequency < 3 || !stats.topCause) return null;

        return (
            `Sur ${stats.frequency} ${make} ${model} similaires diagnostiqués, ` +
            `le code ${dtcCode} est causé à ${stats.resolutionRate.toFixed(0)}% par : ${stats.topCause}.`
        );
    }

    private async upsertKnowledgeEntry(entry: KnowledgeEntry): Promise<void> {
        // Upsert via raw query pour atomic increment
        await this.sessions.query(`
            INSERT INTO knowledge_aggregates
                (make, model, year_min, year_max, fuel_type, dtc_code, confirmed_cause,
                 avg_repair_cost, currency, occurrence_count, resolution_rate)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
            ON CONFLICT (make, model, dtc_code, confirmed_cause)
            DO UPDATE SET
                occurrence_count = knowledge_aggregates.occurrence_count + 1,
                resolution_rate  = (knowledge_aggregates.resolution_rate * knowledge_aggregates.occurrence_count + EXCLUDED.resolution_rate)
                                   / (knowledge_aggregates.occurrence_count + 1),
                last_updated     = NOW()
        `, [
            entry.make, entry.model, entry.yearMin, entry.yearMax, entry.fuelType,
            entry.dtcCode, entry.confirmedCause, entry.avgRepairCost,
            entry.currency, entry.resolutionRate,
        ]).catch(err => {
            // La table n'existe peut-être pas encore en dev — non bloquant
            this.logger.debug(`Knowledge upsert skipped: ${err.message}`);
        });
    }

    private extractRepairCost(session: DiagnosticSession): number | null {
        const result = session.result as any;
        return result?.estimatedRepairCost?.min ?? null;
    }
}
