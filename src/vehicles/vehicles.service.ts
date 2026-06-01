import {
    Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';

const MAX_VEHICLES_BY_PLAN: Record<string, number> = {
    starter: 2,
    plus: 3,
    pro: 5,
    fleet: 999,
};

export interface CreateVehicleDto {
    make: string;
    model: string;
    year?: number;
    fuelType?: string;
    engineCode?: string;
    engineDisplacementCc?: number;
    transmission?: string;
    mileageKm: number;
    plateNumber?: string;
    vin?: string;
    nickname?: string;
    photoUrl?: string;
}

@Injectable()
export class VehiclesService {
    private readonly logger = new Logger(VehiclesService.name);

    constructor(
        @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    ) {}

    async findAllForUser(userId: string): Promise<Vehicle[]> {
        return this.vehicles.find({
            where: { userId, deletedAt: null },
            order: { isPrimary: 'DESC', createdAt: 'ASC' },
        });
    }

    async findOne(id: string, userId: string): Promise<Vehicle> {
        const vehicle = await this.vehicles.findOne({ where: { id, deletedAt: null } });
        if (!vehicle) throw new NotFoundException('Véhicule non trouvé');
        if (vehicle.userId !== userId) throw new ForbiddenException();
        return vehicle;
    }

    async create(userId: string, userPlan: string, dto: CreateVehicleDto): Promise<Vehicle> {
        const count = await this.vehicles.count({ where: { userId, deletedAt: null } });
        const max = MAX_VEHICLES_BY_PLAN[userPlan] ?? 2;

        if (count >= max) {
            throw new ForbiddenException(
                `Votre plan "${userPlan}" est limité à ${max} véhicule(s). Passez à un plan supérieur pour en ajouter plus.`
            );
        }

        const isPrimary = count === 0;
        const vehicle = this.vehicles.create({ ...dto, userId, isPrimary });
        await this.vehicles.save(vehicle);

        this.logger.log(`Vehicle created: ${vehicle.id} for user ${userId}`);
        return vehicle;
    }

    async updateMileage(id: string, userId: string, mileageKm: number): Promise<Vehicle> {
        const vehicle = await this.findOne(id, userId);
        if (mileageKm < vehicle.mileageKm) {
            throw new BadRequestException('Le nouveau kilométrage ne peut pas être inférieur à l\'actuel');
        }
        await this.vehicles.update(id, { mileageKm, mileageUpdatedAt: new Date() });
        return { ...vehicle, mileageKm };
    }

    async updateOCRData(id: string, userId: string, ocrData: Record<string, any>): Promise<Vehicle> {
        const vehicle = await this.findOne(id, userId);
        // Fusionner les données OCR avec les données existantes (OCR complète, ne remplace pas)
        const merged = { ...vehicle, ...this.mapOCRToVehicle(ocrData), ocrExtractedData: ocrData };
        await this.vehicles.save(merged);
        return merged as Vehicle;
    }

    async softDelete(id: string, userId: string): Promise<void> {
        const vehicle = await this.findOne(id, userId);
        await this.vehicles.softDelete(id);
        this.logger.log(`Vehicle soft-deleted: ${id}`);
    }

    private mapOCRToVehicle(ocr: Record<string, any>): Partial<Vehicle> {
        return {
            vin: ocr.vin ?? undefined,
            plateNumber: ocr.plateNumber ?? undefined,
            make: ocr.make ?? undefined,
            model: ocr.model ?? undefined,
            year: ocr.year ? parseInt(ocr.year) : undefined,
        };
    }
}
