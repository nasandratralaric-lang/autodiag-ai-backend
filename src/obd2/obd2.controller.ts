import {
    Controller, Post, Get, Patch, Param, Body,
    UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsNumber, IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard, RequiredPlan } from '../auth/guards/plan.guard';
import { OBD2Service } from './obd2.service';

class StartSessionDto {
    @IsString() vehicleId: string;
    @IsOptional() @IsString() elm327DeviceName?: string;
    @IsOptional() @IsString() elm327Address?: string;
    @IsOptional() @IsString() protocol?: string;
}

class EndSessionDto {
    @IsOptional() @IsArray() dtcsFound?: any[];
    @IsOptional() dtcsFound_items?: any;
    @IsOptional() initialSnapshot?: Record<string, any>;
    @IsOptional() @IsNumber() totalReadings?: number;
    @IsOptional() @IsNumber() avgRpm?: number;
    @IsOptional() @IsNumber() avgCoolantTemp?: number;
}

@ApiTags('obd2')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@RequiredPlan('plus')
@UseGuards(PlanGuard)
@Controller('obd2')
export class OBD2Controller {
    constructor(private readonly obd2Service: OBD2Service) {}

    @Post('sessions')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Démarrer une session OBD2' })
    startSession(@Body() dto: StartSessionDto, @Request() req) {
        return this.obd2Service.startSession({ ...dto, userId: req.user.id });
    }

    @Patch('sessions/:id/end')
    @ApiOperation({ summary: 'Terminer une session OBD2' })
    endSession(@Param('id') id: string, @Body() dto: EndSessionDto, @Request() req) {
        return this.obd2Service.endSession({ ...dto, sessionId: id, userId: req.user.id });
    }

    @Get('sessions/vehicle/:vehicleId')
    @ApiOperation({ summary: 'Historique des sessions OBD2 d\'un véhicule' })
    getSessions(@Param('vehicleId') vehicleId: string, @Request() req) {
        return this.obd2Service.getSessionsForVehicle(vehicleId, req.user.id);
    }

    @Get('snapshot/:vehicleId')
    @ApiOperation({ summary: 'Dernier snapshot OBD2 connu pour un véhicule' })
    getLatestSnapshot(@Param('vehicleId') vehicleId: string, @Request() req) {
        return this.obd2Service.getLatestSnapshot(vehicleId, req.user.id);
    }

    @Patch('sessions/:id/dtcs/clear')
    @ApiOperation({ summary: 'Enregistrer l\'effacement des DTCs' })
    recordClear(@Param('id') id: string, @Request() req) {
        return this.obd2Service.recordDTCClear(id, req.user.id);
    }
}
