import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeService } from './knowledge.service';
import { DiagnosticSession } from '../diagnostics/entities/diagnostic-session.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User } from '../users/entities/user.entity';

@Module({
    imports: [TypeOrmModule.forFeature([DiagnosticSession, Vehicle, User])],
    providers: [KnowledgeService],
    exports: [KnowledgeService],
})
export class KnowledgeModule {}
