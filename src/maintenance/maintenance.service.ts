import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { MaintenanceRecord, MaintenanceReminder } from './entities/maintenance-record.entity';

export interface CreateMaintenanceDto {
    vehicleId: string;
    userId: string;
    category: string;
    title: string;
    description?: string;
    date: string;
    mileageKm?: number;
    cost?: number;
    currency?: string;
    garageName?: string;
    partsReplaced?: any[];
    nextDueDate?: string;
    nextDueMileage?: number;
    invoiceUrl?: string;
}

@Injectable()
export class MaintenanceService {
    constructor(
        @InjectRepository(MaintenanceRecord)
        private readonly records: Repository<MaintenanceRecord>,
        @InjectRepository(MaintenanceReminder)
        private readonly reminders: Repository<MaintenanceReminder>,
    ) {}

    async findForVehicle(vehicleId: string, userId: string): Promise<MaintenanceRecord[]> {
        return this.records.find({
            where: { vehicleId, userId },
            order: { date: 'DESC' },
        });
    }

    async create(dto: CreateMaintenanceDto): Promise<MaintenanceRecord> {
        const record = await this.records.save(
            this.records.create({
                ...dto,
                currency: dto.currency ?? 'MGA',
            })
        );

        // Créer automatiquement un rappel si nextDueDate ou nextDueMileage
        if (dto.nextDueDate || dto.nextDueMileage) {
            await this.reminders.save(this.reminders.create({
                vehicleId:   dto.vehicleId,
                userId:      dto.userId,
                category:    dto.category,
                title:       `Prochain ${dto.title}`,
                dueDate:     dto.nextDueDate ?? null,
                dueMileage:  dto.nextDueMileage ?? null,
                isActive:    true,
            }));
        }

        return record;
    }

    async getPendingReminders(userId: string): Promise<any[]> {
        const today = new Date().toISOString().split('T')[0];
        const reminders = await this.reminders.find({
            where: { userId, isActive: true },
            order: { dueDate: 'ASC' },
        });

        return reminders.map(r => ({
            id:        r.id,
            vehicleId: r.vehicleId,
            title:     r.title,
            dueDate:   r.dueDate,
            dueMileage:r.dueMileage,
            isOverdue: r.dueDate ? r.dueDate < today : false,
        }));
    }

    /**
     * Génère le résumé IA de l'historique pour injection dans le contexte de diagnostic.
     * Retourne les 10 dernières interventions formatées.
     */
    async getAIContextSummary(vehicleId: string): Promise<any[]> {
        const records = await this.records.find({
            where: { vehicleId },
            order: { date: 'DESC' },
            take: 10,
        });

        return records.map(r => ({
            date:          r.date,
            mileageKm:     r.mileageKm,
            category:      r.category,
            title:         r.title,
            description:   r.description,
            partsReplaced: (r.partsReplaced ?? []).map(p => ({ name: p.name, reference: p.reference })),
            aiSummary:     r.aiSummary,
        }));
    }

    async delete(id: string, userId: string): Promise<void> {
        const record = await this.records.findOne({ where: { id } });
        if (!record) throw new NotFoundException();
        if (record.userId !== userId) throw new ForbiddenException();
        await this.records.delete(id);
    }
}
