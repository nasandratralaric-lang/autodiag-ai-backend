import {
    Controller, Post, Body, Get, UseGuards, Request,
    HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

export class RegisterEmailDto {
    @IsEmail() email: string;
    @IsString() @MinLength(8) password: string;
    @IsString() firstName: string;
    @IsString() lastName: string;
}

export class LoginEmailDto {
    @IsEmail() email: string;
    @IsString() password: string;
}

export class RefreshDto {
    @IsString() refreshToken: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    @ApiOperation({ summary: 'Inscription par email' })
    async register(@Body() dto: RegisterEmailDto) {
        const { user, tokens } = await this.authService.register({
            email: dto.email,
            password: dto.password,
            firstName: dto.firstName,
            lastName: dto.lastName,
            authProvider: 'email',
        });
        return { user: this.sanitizeUser(user), tokens };
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Connexion par email + mot de passe' })
    async login(@Body() dto: LoginEmailDto) {
        const { user, tokens } = await this.authService.loginWithEmail(dto.email, dto.password);
        return { user: this.sanitizeUser(user), tokens };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Renouveler les tokens' })
    async refresh(@Body() dto: RefreshDto) {
        return this.authService.refreshTokens(dto.refreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Déconnexion' })
    async logout(@Request() req, @Body() body: { refreshToken?: string }) {
        await this.authService.logout(req.user.id, body.refreshToken);
    }

    @Get('google')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({ summary: 'Initier OAuth Google' })
    googleAuth() {
        // Passport redirige vers Google
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({ summary: 'Callback OAuth Google' })
    async googleCallback(@Request() req, @Res() res: Response) {
        const { tokens } = req.user;
        // Rediriger vers l'app Android avec les tokens
        const deepLink = `autodiag://auth?access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}`;
        res.redirect(deepLink);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Profil de l\'utilisateur connecté' })
    getMe(@Request() req) {
        return this.sanitizeUser(req.user);
    }

    private sanitizeUser(user: any) {
        const { passwordHash, ...safe } = user;
        return safe;
    }
}
