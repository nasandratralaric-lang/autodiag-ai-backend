import {
    Controller, Get, Post, Patch, Delete, Param, Body,
    UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsDateString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MaintenanceService } from './maintenance.service';

class CreateMaintenanceBody {
    @IsString() vehicleId: string;
    @IsString() category: string;
    @IsString() title: string;
    @IsOptional() @IsString() description?: string;
    @IsDateString() date: string;
    @IsOptional() @IsNumber() mileageKm?: number;
    @IsOptional() @IsNumber() cost?: number;
    @IsOptional() @IsString() currency?: string;
    @IsOptional() @IsString() garageName?: string;
    @IsOptional() @IsArray() partsReplaced?: any[];
    @IsOptional() @IsDateString() nextDueDate?: string;
    @IsOptional() @IsNumber() nextDueMileage?: number;
}

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('maintenance')
export class MaintenanceController {
    constructor(private readonly maintenanceService: MaintenanceService) {}

    @Get('vehicle/:vehicleId')
    @ApiOperation({ summary: 'Historique entretien d\'un véhicule' })
    getForVehicle(@Param('vehicleId') vehicleId: string, @Request() req) {
        return this.maintenanceService.findForVehicle(vehicleId, req.user.id);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Ajouter une intervention' })
    create(@Body() dto: CreateMaintenanceBody, @Request() req) {
        return this.maintenanceService.create({ ...dto, userId: req.user.id });
    }

    @Get('reminders')
    @ApiOperation({ summary: 'Rappels de maintenance en attente' })
    getReminders(@Request() req) {
        return this.maintenanceService.getPendingReminders(req.user.id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Modifier une intervention' })
    update(
        @Param('id') id: string,
        @Body() dto: Partial<CreateMaintenanceBody>,
        @Request() req,
    ) {
        return this.maintenanceService.update(id, req.user.id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Supprimer une intervention' })
    delete(@Param('id') id: string, @Request() req) {
        return this.maintenanceService.delete(id, req.user.id);
    }
}
