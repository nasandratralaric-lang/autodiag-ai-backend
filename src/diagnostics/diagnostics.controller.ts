import {
    Controller, Post, Get, Patch, Param, Body,
    UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard, RequiredPlan } from '../auth/guards/plan.guard';
import { DiagnosticsService, StartDiagnosticDto, SubmitTestResultDto } from './diagnostics.service';

@ApiTags('diagnostics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('diagnostics')
export class DiagnosticsController {

    constructor(private readonly diagnosticsService: DiagnosticsService) {}

    @Post('analyze')
    // Plan requis : désactivé pendant la bêta — à remettre sur 'pro' au lancement
    // @RequiredPlan('pro')
    // @UseGuards(PlanGuard)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Lance un nouveau diagnostic IA' })
    @ApiResponse({ status: 201, description: 'Diagnostic créé et analysé' })
    async analyze(@Body() dto: Omit<StartDiagnosticDto, 'userId'>, @Request() req) {
        try {
            return await this.diagnosticsService.startDiagnostic({
                ...dto,
                userId: req.user.id,
            });
        } catch (error) {
            // Log l'erreur réelle pour debug
            this['logger'] = this['logger'] || { error: console.error };
            console.error('[DiagnosticsController] analyze error:', error?.message, error?.stack?.split('\n')[1]);
            throw error;
        }
    }

    @Get(':sessionId')
    @ApiOperation({ summary: 'Récupère une session de diagnostic' })
    async getSession(@Param('sessionId') sessionId: string, @Request() req) {
        return this.diagnosticsService.findSession(sessionId, req.user.id);
    }

    @Post(':sessionId/test-result')
    @ApiOperation({ summary: 'Soumet le résultat d\'un test interactif' })
    async submitTestResult(
        @Param('sessionId') sessionId: string,
        @Body() dto: Omit<SubmitTestResultDto, 'sessionId' | 'userId'>,
        @Request() req,
    ) {
        return this.diagnosticsService.submitTestResult({
            ...dto,
            sessionId,
            userId: req.user.id,
        });
    }

    @Patch(':sessionId/feedback')
    @ApiOperation({ summary: 'Enregistre le feedback post-réparation' })
    async submitFeedback(
        @Param('sessionId') sessionId: string,
        @Body() body: { repairDone: boolean; repairDescription: string; resolved: boolean },
        @Request() req,
    ) {
        return this.diagnosticsService.submitFeedback(
            sessionId,
            req.user.id,
            body.repairDone,
            body.repairDescription,
            body.resolved,
        );
    }
}
