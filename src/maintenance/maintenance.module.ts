import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceRecord, MaintenanceReminder } from './entities/maintenance-record.entity';

@Module({
    imports: [TypeOrmModule.forFeature([MaintenanceRecord, MaintenanceReminder])],
    controllers: [MaintenanceController],
    providers: [MaintenanceService],
    exports: [MaintenanceService],
})
export class MaintenanceModule {}
