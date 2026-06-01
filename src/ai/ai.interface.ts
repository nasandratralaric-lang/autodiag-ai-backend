// AI Provider Interface — AutoDiag AI
// Abstraction agnostique au fournisseur IA

export interface DiagnosticRequest {
    vehicleContext: VehicleContext;
    maintenanceHistory: MaintenanceEntry[];
    symptoms: Symptom[];
    recentWorks: RecentWork[];
    userDescription: string;
    obdSnapshot: OBDSnapshot | null;
    previousDiagnostics: PreviousDiagnostic[];
}

export interface VehicleContext {
    make: string;
    model: string;
    year: number;
    fuelType: string;
    engineCode: string | null;
    engineDisplacementCc: number | null;
    mileageKm: number;
    vin: string | null;
}

export interface MaintenanceEntry {
    date: string;
    mileageKm: number | null;
    category: string;
    title: string;
    description: string | null;
    partsReplaced: { name: string; reference?: string }[];
    aiSummary: string | null;
}

export interface Symptom {
    code: string;
    label: string;
    severity: number;
}

export interface RecentWork {
    type: string;
    description: string;
    date: string | null;
}

export interface OBDSnapshot {
    dtcs: { code: string; description: string; isPending: boolean }[];
    rpm: number | null;
    coolantTemp: number | null;
    engineLoad: number | null;
    maf: number | null;
    map: number | null;
    stftB1: number | null;
    ltftB1: number | null;
    stftB2: number | null;
    ltftB2: number | null;
    batteryVoltage: number | null;
    throttlePos: number | null;
    vehicleSpeed: number | null;
}

export interface PreviousDiagnostic {
    date: string;
    primaryCause: string;
    repair: string | null;
    resolved: boolean | null;
}

export interface DiagnosticResponse {
    primaryCause: string;
    confidence: number;           // 0-100
    severity: SeverityLevel;
    driveRisk: DriveRisk;
    causes: DiagnosticCause[];
    estimatedRepairCost: CostRange | null;
    immediateActions: string[];
    explanation: string;          // Explication grand public
    technicalSummary: string;     // Pour mécanicien
    recommendedTests: RecommendedTest[];
}

export interface DiagnosticCause {
    description: string;
    confidence: number;
    severity: SeverityLevel;
    component: string | null;
    suggestedParts: SuggestedPart[];
}

export interface SuggestedPart {
    name: string;
    oemReference: string | null;
    estimatedCost: number | null;
    currency: string;
}

export interface CostRange {
    min: number;
    max: number;
    currency: string;
}

export interface RecommendedTest {
    title: string;
    instructions: string;
    preconditions: string[];
    estimatedDurationSeconds: number;
    risks: string[];
    pidsToMonitor: string[];
}

export type SeverityLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type DriveRisk = 'safe' | 'monitor' | 'caution' | 'stop_soon' | 'stop_now';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface TestRefinementRequest {
    sessionId: string;
    previousMessages: ChatMessage[];
    testResult: {
        testTitle: string;
        userResponse: string;
        obdBefore: OBDSnapshot | null;
        obdAfter: OBDSnapshot | null;
    };
    currentHypothesis: DiagnosticResponse;
}

export interface AIProviderInterface {
    readonly name: string;
    readonly model: string;

    /**
     * Effectue un diagnostic complet basé sur le contexte fourni.
     */
    analyze(request: DiagnosticRequest): Promise<DiagnosticResponse>;

    /**
     * Affine le diagnostic après un test interactif.
     */
    refineAfterTest(request: TestRefinementRequest): Promise<DiagnosticResponse>;

    /**
     * Conversation libre (pour support et FAQ).
     */
    chat(messages: ChatMessage[], systemPrompt?: string): Promise<string>;

    /**
     * Nombre approximatif de tokens pour une requête (pour quotas).
     */
    estimateTokens(request: DiagnosticRequest): number;
}
