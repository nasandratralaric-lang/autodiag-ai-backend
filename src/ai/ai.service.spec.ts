import { Test, TestingModule } from '@nestjs/testing';
import { AIService } from './ai.service';
import { OpenAIProvider } from './providers/openai.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';
// Redis token mock — compatible v9 and v10
const getRedisToken = (name?: string) => name ? `IORedis:${name}` : 'IORedis:default';
import { ConfigService } from '@nestjs/config';

const mockDiagnosticRequest = {
    vehicleContext: {
        make: 'Toyota', model: 'Corolla', year: 2008,
        fuelType: 'petrol', engineCode: '1ZZ-FE',
        engineDisplacementCc: 1600, mileageKm: 185000, vin: null,
    },
    maintenanceHistory: [],
    symptoms: [{ code: 'idle_rough', label: 'Ralenti instable', severity: 2 }],
    recentWorks: [],
    userDescription: 'Le moteur tremble',
    obdSnapshot: {
        dtcs: [{ code: 'P0301', description: 'Raté allumage cylindre 1', isPending: false }],
        rpm: 750, coolantTemp: 90, engineLoad: 25,
        maf: 3.2, map: 35, stftB1: 2.3, ltftB1: 18.5,
        stftB2: null, ltftB2: null, o2B1S1: null,
        batteryVoltage: 12.4, throttlePos: 5, vehicleSpeed: 0,
    },
    previousDiagnostics: [],
};

const mockAIResponse = {
    primaryCause: 'Bobine allumage cylindre 1',
    confidence:   82,
    severity:     'medium',
    driveRisk:    'caution',
    causes:       [],
    estimatedRepairCost: { min: 35000, max: 80000, currency: 'MGA' },
    immediateActions: [],
    explanation:  'La bobine est probablement défectueuse.',
    technicalSummary: 'P0301 + LTFT B1 high',
    recommendedTests: [],
};

describe('AIService', () => {
    let service: AIService;
    let openai: { name: string; analyze: jest.Mock };
    let claude: { name: string; analyze: jest.Mock };
    let gemini: { name: string; analyze: jest.Mock };
    let redis: { get: jest.Mock; setex: jest.Mock };

    beforeEach(async () => {
        openai = { name: 'openai', analyze: jest.fn().mockResolvedValue(mockAIResponse) };
        claude = { name: 'claude', analyze: jest.fn().mockResolvedValue(mockAIResponse) };
        gemini = { name: 'gemini', analyze: jest.fn().mockResolvedValue(mockAIResponse) };
        redis  = { get: jest.fn().mockResolvedValue(null), setex: jest.fn().mockResolvedValue('OK') };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AIService,
                { provide: OpenAIProvider, useValue: openai },
                { provide: ClaudeProvider, useValue: claude },
                { provide: GeminiProvider, useValue: gemini },
                { provide: ConfigService, useValue: { get: jest.fn() } },
                { provide: getRedisToken(), useValue: redis },
            ],
        }).compile();

        service = module.get(AIService);
    });

    it('utilise le provider primaire (OpenAI) par défaut', async () => {
        const result = await service.analyze(mockDiagnosticRequest as any);
        expect(openai.analyze).toHaveBeenCalledTimes(1);
        expect(result.provider).toBe('openai');
    });

    it('retourne le résultat depuis le cache si disponible', async () => {
        redis.get.mockResolvedValue(JSON.stringify(mockAIResponse));
        const result = await service.analyze(mockDiagnosticRequest as any);
        expect(openai.analyze).not.toHaveBeenCalled();
        expect(result.cached).toBe(true);
    });

    it('bascule sur Claude si OpenAI échoue', async () => {
        openai.analyze.mockRejectedValue(new Error('OpenAI unavailable'));
        const result = await service.analyze(mockDiagnosticRequest as any);
        expect(claude.analyze).toHaveBeenCalledTimes(1);
        expect(result.provider).toBe('claude');
    });

    it('bascule sur Gemini si OpenAI et Claude échouent', async () => {
        openai.analyze.mockRejectedValue(new Error('OpenAI down'));
        claude.analyze.mockRejectedValue(new Error('Claude down'));
        const result = await service.analyze(mockDiagnosticRequest as any);
        expect(gemini.analyze).toHaveBeenCalledTimes(1);
        expect(result.provider).toBe('gemini');
    });

    it('retourne le fallback si tous les providers échouent', async () => {
        openai.analyze.mockRejectedValue(new Error('down'));
        claude.analyze.mockRejectedValue(new Error('down'));
        gemini.analyze.mockRejectedValue(new Error('down'));
        const result = await service.analyze(mockDiagnosticRequest as any);
        expect(result.provider).toBe('fallback');
        expect(result.confidence).toBe(40);
    });

    it('met le résultat en cache après un appel réussi', async () => {
        await service.analyze(mockDiagnosticRequest as any);
        expect(redis.setex).toHaveBeenCalledWith(
            expect.stringMatching(/^diag:cache:/),
            3600,
            expect.any(String),
        );
    });
});
