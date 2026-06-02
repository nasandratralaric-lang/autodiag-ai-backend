import { DiagnosticRequest } from './ai.interface';

export const DIAGNOSTIC_SYSTEM_PROMPT = `Tu es AutoDiag AI, un expert en diagnostic automobile avec 30 ans d'expérience en mécanique, électronique et diagnostic OBD2.

Tu analyses les données techniques d'un véhicule et guides le propriétaire comme un mécanicien expert, mais dans un langage accessible et rassurant.

RÈGLES ABSOLUES :
1. Ne jamais inventer de données non fournies dans le contexte
2. Toujours indiquer ton niveau de confiance (0-100%)
3. Indiquer clairement si le véhicule est dangereux à conduire (driveRisk)
4. Si les données sont insuffisantes, proposer des tests pour obtenir plus d'informations
5. Adapter l'explication au grand public (éviter le jargon dans "explanation")
6. Le champ "technicalSummary" peut être technique (pour mécaniciens)
7. Toujours proposer au moins 1 test interactif quand le diagnostic n'est pas à 95%+
8. Les coûts doivent être en Ariary malgache (MGA) pour les utilisateurs malgaches

RÈGLES TESTS INTERACTIFS SELON DISPONIBILITÉ OBD2 :
- Si OBD2 DISPONIBLE : propose des tests avec lecture de capteurs (PIDs), inverser composants, mesures en temps réel
- Si OBD2 NON DISPONIBLE : propose uniquement des tests physiques réalisables sans équipement :
  * Observation visuelle (fumée, couleur, odeur)
  * Tests auditifs (bruits à froid, en charge, à différents régimes)
  * Tests de comportement (accélération, ralenti, démarrage à chaud/froid)
  * Vérifications manuelles (niveaux, jauges, état visible des pièces)
  * Tests d'élimination (débrancher/rebrancher connecteurs, temporaires)
  JAMAIS demander de lire des PIDs ou codes si OBD2 non disponible.

CONTEXTE MARCHÉ :
- Application utilisée principalement à Madagascar
- Véhicules majoritaires : Toyota Corolla, Mazda 323/626, Honda Civic, Mitsubishi Lancer
- Parc automobile âgé de 10-25 ans
- Estimer les coûts en MGA (1 USD ≈ 4 500 MGA)

FORMAT DE RÉPONSE : JSON strict selon ce schéma :
{
  "primaryCause": "string (cause principale identifiée)",
  "confidence": number (0-100),
  "severity": "info|low|medium|high|critical",
  "driveRisk": "safe|monitor|caution|stop_soon|stop_now",
  "causes": [
    {
      "description": "string",
      "confidence": number,
      "severity": "info|low|medium|high|critical",
      "component": "string|null",
      "suggestedParts": [
        {
          "name": "string",
          "oemReference": "string|null",
          "estimatedCost": number|null,
          "currency": "MGA"
        }
      ]
    }
  ],
  "estimatedRepairCost": {
    "min": number,
    "max": number,
    "currency": "MGA"
  } | null,
  "immediateActions": ["string"],
  "explanation": "string (explication grand public, 2-3 phrases)",
  "technicalSummary": "string (résumé technique pour mécanicien)",
  "recommendedTests": [
    {
      "title": "string",
      "instructions": "string (étapes numérotées, claires)",
      "preconditions": ["string"],
      "estimatedDurationSeconds": number,
      "risks": ["string"],
      "pidsToMonitor": ["0104", "010C", ...]
    }
  ]
}`;

export function buildDiagnosticContext(req: DiagnosticRequest): string {
    const dtcSection = req.obdSnapshot?.dtcs.length
        ? req.obdSnapshot.dtcs.map(d => `  - ${d.code}${d.isPending ? ' (en attente)' : ''}: ${d.description}`).join('\n')
        : '  Aucun code défaut';

    const maintenanceSection = req.maintenanceHistory.length
        ? req.maintenanceHistory.slice(0, 10).map(m =>
            `  - ${m.date}${m.mileageKm ? ` (${m.mileageKm} km)` : ''}: ${m.title}` +
            (m.partsReplaced.length ? `\n    Pièces: ${m.partsReplaced.map(p => p.name).join(', ')}` : '') +
            (m.aiSummary ? `\n    Note: ${m.aiSummary}` : '')
          ).join('\n')
        : '  Aucun historique disponible';

    const obdAvailable = !!req.obdSnapshot;
    const obdSection = obdAvailable ? `
⚡ OBD2 CONNECTÉ — données réelles disponibles
  RPM: ${req.obdSnapshot!.rpm ?? 'N/D'} tr/min
  Température liquide: ${req.obdSnapshot!.coolantTemp ?? 'N/D'}°C
  Charge moteur: ${req.obdSnapshot!.engineLoad ?? 'N/D'}%
  Débit air (MAF): ${req.obdSnapshot!.maf ?? 'N/D'} g/s
  Pression collecteur (MAP): ${req.obdSnapshot!.map ?? 'N/D'} kPa
  Position papillon: ${req.obdSnapshot!.throttlePos ?? 'N/D'}%
  STFT Bank 1: ${req.obdSnapshot!.stftB1 ?? 'N/D'}%
  LTFT Bank 1: ${req.obdSnapshot!.ltftB1 ?? 'N/D'}%
  STFT Bank 2: ${req.obdSnapshot!.stftB2 ?? 'N/D'}%
  LTFT Bank 2: ${req.obdSnapshot!.ltftB2 ?? 'N/D'}%
  Tension batterie: ${req.obdSnapshot!.batteryVoltage ?? 'N/D'} V
  Vitesse: ${req.obdSnapshot!.vehicleSpeed ?? 'N/D'} km/h
  → Tu peux proposer des tests OBD2 (lecture PIDs, inverser composants, mesures en temps réel)`
    : `
⚠️ PAS DE CONNEXION OBD2 — diagnostic basé sur les symptômes uniquement
  → Propose UNIQUEMENT des tests physiques sans équipement électronique :
    observation visuelle, tests auditifs, vérifications manuelles, tests comportementaux
  → Ne demande JAMAIS de lire des codes ou capteurs OBD2`;

    const previousDiagsSection = req.previousDiagnostics.length
        ? req.previousDiagnostics.slice(0, 3).map(d =>
            `  - ${d.date}: ${d.primaryCause}` +
            (d.repair ? ` → Réparation: ${d.repair}` : '') +
            (d.resolved !== null ? ` → ${d.resolved ? '✅ Résolu' : '❌ Non résolu'}` : '')
          ).join('\n')
        : '  Aucun diagnostic précédent';

    return `=== INFORMATIONS VÉHICULE ===
Marque/Modèle: ${req.vehicleContext.make} ${req.vehicleContext.model} ${req.vehicleContext.year}
Motorisation: ${req.vehicleContext.engineCode ?? 'N/D'} — ${req.vehicleContext.fuelType}${req.vehicleContext.engineDisplacementCc ? ` ${req.vehicleContext.engineDisplacementCc}cc` : ''}
Kilométrage: ${req.vehicleContext.mileageKm.toLocaleString()} km
VIN: ${req.vehicleContext.vin ?? 'Non fourni'}

=== CODES DÉFAUTS OBD2 ===
${dtcSection}

=== DONNÉES CAPTEURS OBD2 ===
${obdSection}

=== SYMPTÔMES SIGNALÉS PAR L'UTILISATEUR ===
${req.symptoms.map(s => `  - ${s.label} (sévérité ${s.severity}/5)`).join('\n') || '  Aucun symptôme précisé'}

=== TRAVAUX RÉCENTS ===
${req.recentWorks.map(w => `  - ${w.type}: ${w.description}${w.date ? ` (${w.date})` : ''}`).join('\n') || '  Aucun travail récent signalé'}

=== DESCRIPTION DU PROBLÈME (UTILISATEUR) ===
${req.userDescription || 'Aucune description fournie'}

=== HISTORIQUE ENTRETIEN (10 dernières interventions) ===
${maintenanceSection}

=== DIAGNOSTICS PRÉCÉDENTS ===
${previousDiagsSection}

Effectue un diagnostic complet et retourne le résultat au format JSON défini.`;
}

export const DIAGNOSTIC_RESPONSE_SCHEMA = {
    type: 'object',
    required: ['primaryCause', 'confidence', 'severity', 'driveRisk', 'causes', 'explanation'],
    properties: {
        primaryCause: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 100 },
        severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
        driveRisk: { type: 'string', enum: ['safe', 'monitor', 'caution', 'stop_soon', 'stop_now'] },
    },
};
