import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OBD2Session } from './entities/obd2-session.entity';

export interface StartSessionDto {
    vehicleId: string;
    userId: string;
    elm327DeviceName?: string;
    elm327Address?: string;
    protocol?: string;
}

export interface EndSessionDto {
    sessionId: string;
    userId: string;
    dtcsFound?: { code: string; description: string; isPending: boolean }[];
    initialSnapshot?: Record<string, any>;
    totalReadings?: number;
    avgRpm?: number;
    avgCoolantTemp?: number;
}

@Injectable()
export class OBD2Service {
    private readonly logger = new Logger(OBD2Service.name);

    constructor(
        @InjectRepository(OBD2Session)
        private readonly sessions: Repository<OBD2Session>,
    ) {}

    async startSession(dto: StartSessionDto): Promise<OBD2Session> {
        const session = this.sessions.create({
            vehicleId: dto.vehicleId,
            userId: dto.userId,
            elm327DeviceName: dto.elm327DeviceName ?? null,
            elm327Address: dto.elm327Address ?? null,
            protocol: dto.protocol ?? null,
        });
        await this.sessions.save(session);
        this.logger.log(`OBD2 session started: ${session.id} for vehicle ${dto.vehicleId}`);
        return session;
    }

    async endSession(dto: EndSessionDto): Promise<OBD2Session> {
        const session = await this.findSession(dto.sessionId, dto.userId);

        const endedAt = new Date();
        const durationSeconds = Math.round(
            (endedAt.getTime() - session.startedAt.getTime()) / 1000
        );

        await this.sessions.update(session.id, {
            endedAt,
            durationSeconds,
            dtcsFound: dto.dtcsFound ?? null,
            initialSnapshot: dto.initialSnapshot ?? null,
            totalReadings: dto.totalReadings ?? 0,
            avgRpm: dto.avgRpm ?? null,
            avgCoolantTemp: dto.avgCoolantTemp ?? null,
        });

        return { ...session, endedAt, durationSeconds };
    }

    async getSessionsForVehicle(vehicleId: string, userId: string): Promise<OBD2Session[]> {
        return this.sessions.find({
            where: { vehicleId, userId },
            order: { startedAt: 'DESC' },
            take: 20,
        });
    }

    async getLatestSnapshot(vehicleId: string, userId: string): Promise<Record<string, any> | null> {
        const session = await this.sessions.findOne({
            where: { vehicleId, userId },
            order: { startedAt: 'DESC' },
        });
        return session?.initialSnapshot ?? null;
    }

    async recordDTCClear(sessionId: string, userId: string): Promise<void> {
        const session = await this.findSession(sessionId, userId);
        await this.sessions.update(session.id, { dtcsCleared: true });
    }

    private async findSession(sessionId: string, userId: string): Promise<OBD2Session> {
        const session = await this.sessions.findOne({ where: { id: sessionId } });
        if (!session) throw new NotFoundException('Session OBD2 non trouvée');
        if (session.userId !== userId) throw new ForbiddenException();
        return session;
    }
}
