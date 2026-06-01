import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
import { DiagnosticSession, DiagnosticMessage, DiagnosticTest } from './entities/diagnostic-session.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { AIService } from '../ai/ai.service';

const mockVehicle = (): Partial<Vehicle> => ({
    id: 'vehicle-1',
    userId: 'user-1',
    make: 'Toyota',
    model: 'Corolla',
    year: 2008,
    fuelType: 'petrol',
    engineCode: '1ZZ-FE',
    mileageKm: 185000,
    vin: null,
    engineDisplacementCc: 1600,
});

const mockAIResult = {
    primaryCause: 'Bobine allumage cylindre 1',
    confidence: 82,
    severity: 'medium',
    driveRisk: 'caution',
    causes: [{ description: 'Bobine cylindre 1', confidence: 82, severity: 'medium', component: 'Ignition coil', suggestedParts: [] }],
    estimatedRepairCost: { min: 35000, max: 80000, currency: 'MGA' },
    immediateActions: ['Évitez les longs trajets'],
    explanation: 'La bobine d\'allumage du cylindre 1 est défectueuse.',
    technicalSummary: 'P0301 + LTFT B1 +18% → coil failure suspected',
    recommendedTests: [
        {
            title: 'Inversion bobine',
            instructions: 'Échangez la bobine 1 et 2...',
            preconditions: ['Moteur arrêté'],
            estimatedDurationSeconds: 180,
            risks: ['Ne pas toucher les pièces sous tension'],
            pidsToMonitor: ['0C', '04'],
        }
    ],
    provider: 'openai',
    cached: false,
};

describe('DiagnosticsService', () => {
    let service: DiagnosticsService;
    let vehiclesRepo: { findOne: jest.Mock };
    let sessionsRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; update: jest.Mock };
    let testsRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
    let messagesRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
    let aiService: { analyze: jest.Mock; refineAfterTest: jest.Mock };

    beforeEach(async () => {
        vehiclesRepo = { findOne: jest.fn().mockResolvedValue(mockVehicle()) };
        sessionsRepo = {
            create: jest.fn(dto => ({ id: 'session-1', ...dto })),
            save:   jest.fn(entity => Promise.resolve({ id: 'session-1', ...entity })),
            findOne:jest.fn(),
            update: jest.fn().mockResolvedValue({}),
        };
        testsRepo = {
            create: jest.fn(dto => dto),
            save:   jest.fn(entities => Promise.resolve(Array.isArray(entities) ? entities : [entities])),
            findOne:jest.fn(),
        };
        messagesRepo = {
            find:   jest.fn().mockResolvedValue([]),
            create: jest.fn(dto => dto),
            save:   jest.fn(entity => Promise.resolve(entity)),
        };
        aiService = {
            analyze:        jest.fn().mockResolvedValue(mockAIResult),
            refineAfterTest: jest.fn().mockResolvedValue(mockAIResult),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DiagnosticsService,
                { provide: getRepositoryToken(DiagnosticSession), useValue: sessionsRepo },
                { provide: getRepositoryToken(DiagnosticMessage), useValue: messagesRepo },
                { provide: getRepositoryToken(DiagnosticTest),    useValue: testsRepo },
                { provide: getRepositoryToken(Vehicle),           useValue: vehiclesRepo },
                { provide: AIService, useValue: aiService },
            ],
        }).compile();

        service = module.get(DiagnosticsService);

        // Mock findSession pour retourner la session complète
        sessionsRepo.findOne.mockResolvedValue({
            id: 'session-1', vehicleId: 'vehicle-1', userId: 'user-1',
            status: 'completed', result: mockAIResult, tests: [],
        });
    });

    describe('startDiagnostic', () => {
        it('crée une session et retourne le résultat IA', async () => {
            const result = await service.startDiagnostic({
                vehicleId: 'vehicle-1',
                userId: 'user-1',
                symptoms: [{ code: 'idle_rough', label: 'Ralenti instable', severity: 2 }],
                recentWorks: [],
                userDescription: 'Le moteur tremble',
                obdSnapshot: { dtcs: [{ code: 'P0301', description: 'Raté cylindre 1', isPending: false }] },
            });

            expect(aiService.analyze).toHaveBeenCalledTimes(1);
            expect(result.primaryCause).toBe('Bobine allumage cylindre 1');
        });

        it('lève NotFoundException si le véhicule n\'existe pas', async () => {
            vehiclesRepo.findOne.mockResolvedValue(null);
            await expect(service.startDiagnostic({
                vehicleId: 'unknown', userId: 'user-1',
                symptoms: [], recentWorks: [], userDescription: '',
            })).rejects.toThrow(NotFoundException);
        });

        it('lève ForbiddenException si le véhicule n\'appartient pas à l\'utilisateur', async () => {
            vehiclesRepo.findOne.mockResolvedValue({ ...mockVehicle(), userId: 'other-user' });
            await expect(service.startDiagnostic({
                vehicleId: 'vehicle-1', userId: 'user-1',
                symptoms: [], recentWorks: [], userDescription: '',
            })).rejects.toThrow(ForbiddenException);
        });

        it('crée les tests recommandés en base', async () => {
            await service.startDiagnostic({
                vehicleId: 'vehicle-1', userId: 'user-1',
                symptoms: [], recentWorks: [], userDescription: '',
            });
            expect(testsRepo.save).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ title: 'Inversion bobine' })
                ])
            );
        });
    });

    describe('submitFeedback', () => {
        it('enregistre le feedback avec résolution', async () => {
            await service.submitFeedback('session-1', 'user-1', true, 'Bobine remplacée', true);
            expect(sessionsRepo.update).toHaveBeenCalledWith('session-1', expect.objectContaining({
                repairDone: true,
                repairResolved: true,
            }));
        });
    });
});
