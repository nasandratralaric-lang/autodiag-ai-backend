import {
    Controller, Get, Post, Patch, Delete, Param, Body,
    UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehiclesService, CreateVehicleDto } from './vehicles.service';

class CreateVehicleBody implements CreateVehicleDto {
    @IsString() make: string;
    @IsString() model: string;
    @IsOptional() @IsInt() @Min(1900) @Max(2030) year?: number;
    @IsOptional() @IsEnum(['petrol','diesel','lpg','electric','hybrid']) fuelType?: string;
    @IsOptional() @IsString() engineCode?: string;
    @IsOptional() @IsInt() engineDisplacementCc?: number;
    @IsOptional() @IsEnum(['manual','automatic','cvt','semi_auto']) transmission?: string;
    @IsInt() @Min(0) mileageKm: number;
    @IsOptional() @IsString() plateNumber?: string;
    @IsOptional() @IsString() vin?: string;
    @IsOptional() @IsString() nickname?: string;
    @IsOptional() @IsString() photoUrl?: string;
}

class UpdateMileageBody {
    @IsInt() @Min(0) mileageKm: number;
}

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vehicles')
export class VehiclesController {
    constructor(private readonly vehiclesService: VehiclesService) {}

    @Get()
    @ApiOperation({ summary: 'Liste les véhicules de l\'utilisateur' })
    findAll(@Request() req) {
        return this.vehiclesService.findAllForUser(req.user.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Détails d\'un véhicule' })
    findOne(@Param('id') id: string, @Request() req) {
        return this.vehiclesService.findOne(id, req.user.id);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Ajouter un véhicule' })
    create(@Body() dto: CreateVehicleBody, @Request() req) {
        return this.vehiclesService.create(req.user.id, req.user.plan, dto);
    }

    @Patch(':id/mileage')
    @ApiOperation({ summary: 'Mettre à jour le kilométrage' })
    updateMileage(
        @Param('id') id: string,
        @Body() body: UpdateMileageBody,
        @Request() req,
    ) {
        return this.vehiclesService.updateMileage(id, req.user.id, body.mileageKm);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Supprimer un véhicule' })
    remove(@Param('id') id: string, @Request() req) {
        return this.vehiclesService.softDelete(id, req.user.id);
    }
}
