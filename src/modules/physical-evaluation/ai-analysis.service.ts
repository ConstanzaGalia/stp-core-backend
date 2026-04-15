import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import {
  PhysicalEvaluation,
  AiAnalysis,
  AthleteContext,
} from 'src/entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from 'src/entities/physical-evaluation-test.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import { PhysicalEvaluationService } from './physical-evaluation.service';
import { AthleteContextDto } from './dto/generate-ai-analysis.dto';

const STAFF_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

/** Keys internas que no deben enviarse a la IA (metadatos de storage/debug). */
const INTERNAL_METRIC_KEYS = new Set(['_file', '_detection', 'rawTextSample', '_source', '_raw']);

const SYSTEM_PROMPT = `Eres un experto en ciencias del deporte, biomecánica y evaluación física de atletas de alto rendimiento.
Se te proporcionarán los resultados crudos de una evaluación física obtenidos desde una plataforma de fuerza (Ivolution) y el contexto del atleta.
Tu tarea es generar un análisis estructurado, clínico y accionable en español, orientado al staff técnico de un centro de alto rendimiento.

REGLAS CRÍTICAS:
1. Retorna ÚNICAMENTE un objeto JSON válido. No incluyas texto, explicaciones ni marcadores markdown fuera del JSON.
2. Cumple exactamente con el schema JSON indicado en el mensaje del usuario.
3. Adapta el análisis al contexto específico del atleta (deporte, nivel, lesiones).
4. Sé preciso con los valores numéricos; no inventes datos que no estén en los tests.
5. Las recomendaciones deben ser concretas y aplicables a la planificación del entrenamiento.
6. Si hay lesiones registradas, las recomendaciones DEBEN reflejar esas restricciones.`;

const AI_ANALYSIS_SCHEMA = `{
  "version": "string (siempre '1.0')",
  "executiveSummary": "string (2-4 oraciones: estado global del atleta, principales fortalezas y debilidades)",
  "overallScore": "number 0-100 o null",
  "overallLevel": "'low' | 'medium' | 'high' | null",
  "capacityProfile": {
    "potencia": { "score": "number 0-100 o null", "narrative": "string (1-2 oraciones)" },
    "reactividad": { "score": "number 0-100 o null", "narrative": "string" },
    "fuerza": { "score": "number 0-100 o null", "narrative": "string" },
    "asimetria": { "score": "number 0-100 o null (100=sin asimetría, 0=asimetría severa)", "narrative": "string" },
    "resistencia": { "score": "number 0-100 o null", "narrative": "string" },
    "estrategia": { "score": "number 0-100 o null", "narrative": "string" }
  },
  "keyFindings": [
    {
      "severity": "'critical' | 'warning' | 'positive'",
      "title": "string corto",
      "body": "string explicativo",
      "metric": "string opcional (nombre de la métrica)",
      "value": "number opcional",
      "unit": "string opcional (ej: 'cm', '%', 'N', 's')"
    }
  ],
  "trainingRecommendations": [
    {
      "priority": "'high' | 'medium' | 'low'",
      "category": "string (ej: 'Fuerza', 'Pliometría', 'Asimetría', 'Movilidad')",
      "title": "string",
      "rationale": "string (por qué esta recomendación basada en los datos)",
      "exercises": ["string (ejercicios concretos)"],
      "timeframe": "string (ej: '4-6 semanas', 'Inmediato')"
    }
  ],
  "retestSchedule": [
    {
      "testType": "string",
      "interval": "string (ej: '4 semanas', '8 semanas')",
      "targetMetric": "string opcional",
      "targetValue": "string opcional (ej: '>35 cm', '<10%')"
    }
  ],
  "riskFlags": [
    {
      "area": "string",
      "description": "string",
      "urgency": "'immediate' | 'moderate' | 'monitoring'"
    }
  ],
  "sportSpecificNotes": "string o null"
}`;

@Injectable()
export class AiAnalysisService {
  private readonly client: Anthropic;

  constructor(
    @InjectRepository(PhysicalEvaluation)
    private readonly evaluationRepo: Repository<PhysicalEvaluation>,
    private readonly physicalEvaluations: PhysicalEvaluationService,
  ) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    });
  }

  async generateForEvaluation(
    actor: User,
    evaluationId: string,
    dto: { athleteContext?: AthleteContextDto; forceRerun?: boolean },
  ): Promise<PhysicalEvaluation> {
    if (!STAFF_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Solo el staff puede generar análisis con IA');
    }

    const ev = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
      relations: ['tests', 'user'],
    });
    if (!ev) throw new NotFoundException('Evaluación no encontrada');

    // Verificar acceso
    await this.physicalEvaluations.assertCanAccessAthlete(actor, ev.user.id, true);

    // Idempotencia: si ya existe y no se fuerza, devolver caché
    if (ev.aiAnalysis && !dto.forceRerun) {
      return this.findOneWithTests(evaluationId);
    }

    // Guardar contexto del atleta si se provee
    if (dto.athleteContext) {
      ev.athleteContext = this.mapDtoToAthleteContext(dto.athleteContext);
    }

    ev.aiAnalysisStatus = 'processing';
    ev.aiAnalysisError = null;
    await this.evaluationRepo.save(ev);

    try {
      const aiAnalysis = await this.buildAndCallClaude(ev, ev.athleteContext ?? null);
      ev.aiAnalysis = aiAnalysis;
      ev.aiAnalysisStatus = 'ready';
      ev.aiAnalysisError = null;
    } catch (err: unknown) {
      ev.aiAnalysisStatus = 'error';
      ev.aiAnalysisError = err instanceof Error ? err.message : String(err);
      await this.evaluationRepo.save(ev);
      throw err;
    }

    await this.evaluationRepo.save(ev);
    return this.findOneWithTests(evaluationId);
  }

  private async buildAndCallClaude(
    ev: PhysicalEvaluation,
    athleteContext: AthleteContext | null,
  ): Promise<AiAnalysis> {
    const userMessage = this.buildUserMessage(ev, athleteContext);

    const message = await this.client.messages.create({
      model: process.env.ANTHROPIC_AI_MODEL ?? 'claude-opus-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    return this.parseAiResponse(rawText, ev, athleteContext);
  }

  private buildUserMessage(ev: PhysicalEvaluation, athleteContext: AthleteContext | null): string {
    const sections: string[] = [];

    // Contexto del atleta
    if (athleteContext) {
      sections.push(`## Contexto del Atleta
- Deporte: ${athleteContext.sport ?? 'No especificado'}
- Disciplina: ${athleteContext.discipline ?? 'No especificado'}
- Nivel: ${athleteContext.level ?? 'No especificado'}
- Lesiones: ${athleteContext.injuries?.length ? athleteContext.injuries.join(', ') : 'Ninguna'}
- Condiciones médicas: ${athleteContext.conditions?.length ? athleteContext.conditions.join(', ') : 'Ninguna'}
- Notas: ${athleteContext.notes ?? 'Sin notas'}`);
    } else {
      sections.push('## Contexto del Atleta\nNo se proporcionó contexto específico del atleta.');
    }

    // Datos de los tests
    const testsData = this.buildTestsPayload(ev.tests ?? []);
    sections.push(`## Datos de los Tests\n${JSON.stringify(testsData, null, 2)}`);

    // Análisis determinista previo (si existe)
    if (ev.structuredAnalysis) {
      const sa = ev.structuredAnalysis as Record<string, unknown>;
      const contextScores: Record<string, unknown> = {};
      if (sa.categoryScores) contextScores.categoryScores = sa.categoryScores;
      if (sa.totalScore !== undefined) contextScores.totalScore = sa.totalScore;
      if (sa.level) contextScores.level = sa.level;
      if (sa.triggeredRules) contextScores.triggeredRules = sa.triggeredRules;
      if (Object.keys(contextScores).length > 0) {
        sections.push(`## Análisis Determinista Previo (contexto complementario)\n${JSON.stringify(contextScores, null, 2)}`);
      }
    }

    // Schema esperado
    sections.push(`## Schema JSON Requerido
Retorna ÚNICAMENTE un objeto JSON que cumpla exactamente con este schema:
${AI_ANALYSIS_SCHEMA}

IMPORTANTE: El campo "version" siempre debe ser "1.0". No incluyas texto fuera del JSON.`);

    return sections.join('\n\n');
  }

  private buildTestsPayload(tests: PhysicalEvaluationTest[]): unknown[] {
    return tests
      .filter((t) => t.testType?.toLowerCase() !== 'stp_legacy')
      .map((t) => ({
        testType: t.testType,
        testName: t.testName,
        metrics: this.sanitizeMetrics(t.metrics),
        aggregates: t.aggregates,
      }));
  }

  private sanitizeMetrics(metrics: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (INTERNAL_METRIC_KEYS.has(key) || key.startsWith('_')) continue;
      result[key] = value;
    }
    return result;
  }

  private parseAiResponse(
    rawText: string,
    ev: PhysicalEvaluation,
    athleteContext: AthleteContext | null,
  ): AiAnalysis {
    // Eliminar posibles bloques markdown
    const cleaned = rawText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`La IA retornó una respuesta no parseable como JSON: ${rawText.slice(0, 200)}`);
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('La respuesta de la IA no es un objeto JSON válido');
    }

    const obj = parsed as Record<string, unknown>;

    return {
      version: typeof obj.version === 'string' ? obj.version : '1.0',
      model: process.env.ANTHROPIC_AI_MODEL ?? 'claude-opus-4-6',
      generatedAt: new Date().toISOString(),
      athleteContext,
      executiveSummary: typeof obj.executiveSummary === 'string' ? obj.executiveSummary : '',
      overallScore: typeof obj.overallScore === 'number' ? obj.overallScore : null,
      overallLevel: this.parseOverallLevel(obj.overallLevel),
      capacityProfile: this.parseCapacityProfile(obj.capacityProfile),
      keyFindings: this.parseKeyFindings(obj.keyFindings),
      trainingRecommendations: this.parseTrainingRecommendations(obj.trainingRecommendations),
      retestSchedule: this.parseRetestSchedule(obj.retestSchedule),
      riskFlags: this.parseRiskFlags(obj.riskFlags),
      sportSpecificNotes: typeof obj.sportSpecificNotes === 'string' ? obj.sportSpecificNotes : null,
    };
  }

  private parseOverallLevel(v: unknown): 'low' | 'medium' | 'high' | null {
    if (v === 'low' || v === 'medium' || v === 'high') return v;
    return null;
  }

  private parseCapacityProfile(raw: unknown): AiAnalysis['capacityProfile'] {
    const categories = ['potencia', 'reactividad', 'fuerza', 'asimetria', 'resistencia', 'estrategia'] as const;
    const fallback = { score: null, narrative: '' };
    if (typeof raw !== 'object' || raw === null) {
      return {
        potencia: fallback, reactividad: fallback, fuerza: fallback,
        asimetria: fallback, resistencia: fallback, estrategia: fallback,
      };
    }
    const obj = raw as Record<string, unknown>;
    const result = {} as AiAnalysis['capacityProfile'];
    for (const cat of categories) {
      const entry = obj[cat] as Record<string, unknown> | undefined;
      result[cat] = {
        score: typeof entry?.score === 'number' ? entry.score : null,
        narrative: typeof entry?.narrative === 'string' ? entry.narrative : '',
      };
    }
    return result;
  }

  private parseKeyFindings(raw: unknown): AiAnalysis['keyFindings'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        severity: (['critical', 'warning', 'positive'] as const).includes(item.severity as never)
          ? (item.severity as 'critical' | 'warning' | 'positive')
          : 'warning',
        title: typeof item.title === 'string' ? item.title : '',
        body: typeof item.body === 'string' ? item.body : '',
        ...(typeof item.metric === 'string' ? { metric: item.metric } : {}),
        ...(typeof item.value === 'number' ? { value: item.value } : {}),
        ...(typeof item.unit === 'string' ? { unit: item.unit } : {}),
      }));
  }

  private parseTrainingRecommendations(raw: unknown): AiAnalysis['trainingRecommendations'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        priority: (['high', 'medium', 'low'] as const).includes(item.priority as never)
          ? (item.priority as 'high' | 'medium' | 'low')
          : 'medium',
        category: typeof item.category === 'string' ? item.category : '',
        title: typeof item.title === 'string' ? item.title : '',
        rationale: typeof item.rationale === 'string' ? item.rationale : '',
        exercises: Array.isArray(item.exercises)
          ? item.exercises.filter((e): e is string => typeof e === 'string')
          : [],
        timeframe: typeof item.timeframe === 'string' ? item.timeframe : '',
      }));
  }

  private parseRetestSchedule(raw: unknown): AiAnalysis['retestSchedule'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        testType: typeof item.testType === 'string' ? item.testType : '',
        interval: typeof item.interval === 'string' ? item.interval : '',
        ...(typeof item.targetMetric === 'string' ? { targetMetric: item.targetMetric } : {}),
        ...(typeof item.targetValue === 'string' ? { targetValue: item.targetValue } : {}),
      }));
  }

  private parseRiskFlags(raw: unknown): AiAnalysis['riskFlags'] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        area: typeof item.area === 'string' ? item.area : '',
        description: typeof item.description === 'string' ? item.description : '',
        urgency: (['immediate', 'moderate', 'monitoring'] as const).includes(item.urgency as never)
          ? (item.urgency as 'immediate' | 'moderate' | 'monitoring')
          : 'monitoring',
      }));
  }

  private mapDtoToAthleteContext(dto: AthleteContextDto): AthleteContext {
    return {
      sport: dto.sport ?? null,
      discipline: dto.discipline ?? null,
      level: (dto.level as AthleteContext['level']) ?? null,
      injuries: dto.injuries ?? [],
      conditions: dto.conditions ?? [],
      notes: dto.notes ?? null,
    };
  }

  private async findOneWithTests(evaluationId: string): Promise<PhysicalEvaluation> {
    const ev = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
      relations: ['tests', 'user'],
    });
    if (!ev) throw new NotFoundException('Evaluación no encontrada');
    return ev;
  }
}
