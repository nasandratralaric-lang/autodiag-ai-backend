import { Controller, Get, Patch, Delete, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

class UpdateProfileDto {
    @IsOptional() @IsString() firstName?: string;
    @IsOptional() @IsString() lastName?: string;
    @IsOptional() @IsString() locale?: string;
    @IsOptional() @IsEnum(['beginner', 'intermediate', 'advanced'])
    mechanicLevel?: string;
}

class UpdateConsentsDto {
    @IsOptional() @IsBoolean() analytics?: boolean;
    @IsOptional() @IsBoolean() dataSharing?: boolean;
    @IsOptional() @IsBoolean() marketing?: boolean;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get('me')
    @ApiOperation({ summary: 'Profil utilisateur complet' })
    getProfile(@Request() req) {
        return this.usersService.findById(req.user.id);
    }

    @Patch('me')
    @ApiOperation({ summary: 'Mettre à jour le profil' })
    updateProfile(@Body() dto: UpdateProfileDto, @Request() req) {
        return this.usersService.updateProfile(req.user.id, dto);
    }

    @Patch('me/consents')
    @ApiOperation({ summary: 'Mettre à jour les consentements RGPD' })
    updateConsents(@Body() dto: UpdateConsentsDto, @Request() req) {
        return this.usersService.updateConsents(req.user.id, dto);
    }

    @Delete('me')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Demander la suppression du compte (RGPD)' })
    requestDeletion(@Request() req) {
        return this.usersService.requestDeletion(req.user.id);
    }
}
