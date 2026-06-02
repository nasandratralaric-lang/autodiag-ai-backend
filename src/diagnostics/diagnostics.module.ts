import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';
import { DiagnosticSession, DiagnosticMessage, DiagnosticTest } from './entities/diagnostic-session.entity';
import { AIModule } from '../ai/ai.module';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User } from '../users/entities/user.entity';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([DiagnosticSession, DiagnosticMessage, DiagnosticTest, Vehicle, User]),
        AIModule,
        MaintenanceModule,
    ],
    controllers: [DiagnosticsController],
    providers: [DiagnosticsService],
    exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
