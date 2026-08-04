import { BadRequestException, Injectable } from '@nestjs/common';
import { PhotocellImportDto } from './dto/photocell-import.dto';
import { EvaluationProtocolService } from './evaluation-protocol.service';
import { EvaluationProtocol } from 'src/entities/evaluation-protocol.entity';

export type PhotocellMeasurementMode =
  | 'start_finish'
  | 'split_profile'
  | 'repeated_attempts'
  | 'repeated_sprints';

export type PhotocellProtocolCategory = 'speed' | 'agility' | 'resistance';

type ProtocolDef = {
  code: string;
  label: string;
  testType: string;
  category: PhotocellProtocolCategory;
  distanceMeters?: number;
  gates?: number[];
};

type ParsedRow = {
  raw: Record<string, string | null>;
  testName: string | null;
  athleteName: string | null;
  sourceDate: string | null;
  institution: string | null;
  sport: string | null;
  age: number | null;
  stimulus: string | null;
  sourceNumber: number | null;
  splitIndex: number | null;
  splitMeters: number | null;
  timeSeconds: number | null;
  velocityMps: number | null;
  accelerationMps2: number | null;
  repetitionIndex: number | null;
  powerWatts: number | null;
  sprintNumber: number | null;
};

export type CanonicalMeasurement = {
  partial: number | null;
  distance: number | null;
  time: number | null;
  velocity: number | null;
  acceleration: number | null;
  power: number | null;
  label?: string;
  extras?: Record<string, unknown>;
};

export type CanonicalEvaluationPreview = {
  protocolCode: string;
  protocolLabel: string;
  testType: string;
  evaluationDate: string;
  attempt: number | null;
  measurementMode: PhotocellMeasurementMode;
  measurements: CanonicalMeasurement[];
  derivedMetrics: Record<string, number | null>;
  /** Compat reporte legacy */
  metrics: Record<string, unknown>;
  repetitions: Array<Record<string, unknown>>;
  aggregates: Record<string, unknown>;
  summaryAnalysis: string;
  completeness: number;
  warnings: string[];
};

export type PhotocellPreviewResponse = {
  sourceType: 'photocell';
  athleteId: string;
  evaluationDate: string;
  sourceName: string | null;
  preview: {
    headers: string[];
    rows: Array<Array<string | null>>;
  };
  warnings: string[];
  evaluations: CanonicalEvaluationPreview[];
  /** Compat flat (primera evaluación candidata) */
  protocolCode: string;
  protocolLabel: string;
  testType: string;
  metrics: Record<string, unknown>;
  repetitions: Array<Record<string, unknown>>;
  aggregates: Record<string, unknown>;
  summaryAnalysis: string;
  completeness: number;
};

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseLocalizedNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  const normalized =
    compact.includes(',') && compact.includes('.')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return round3(values.reduce((sum, current) => sum + current, 0) / values.length);
}

function round3(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function pickValue(record: Record<string, string | null>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = record[alias];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function pickNumber(record: Record<string, string | null>, aliases: string[]): number | null {
  return parseLocalizedNumber(pickValue(record, aliases));
}

function metricStat(values: number[], higherIsBetter: boolean): { best: number | null; mean: number | null; worst: number | null } {
  if (!values.length) return { best: null, mean: null, worst: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    best: round3(higherIsBetter ? sorted[sorted.length - 1] : sorted[0]),
    mean: average(values),
    worst: round3(higherIsBetter ? sorted[0] : sorted[sorted.length - 1]),
  };
}

function protocolFromEntity(entity: EvaluationProtocol): ProtocolDef {
  const config = entity.config ?? {};
  const distanceMeters =
    typeof config.distanceMeters === 'number' ? config.distanceMeters : undefined;
  const gates = Array.isArray(config.gates)
    ? config.gates.filter((g): g is number => typeof g === 'number')
    : undefined;
  const testType =
    typeof config.testType === 'string' && config.testType
      ? config.testType
      : `photocell_${entity.code}`;
  const category = (entity.category as PhotocellProtocolCategory) || 'speed';
  return {
    code: entity.code,
    label: entity.label,
    testType,
    category,
    distanceMeters,
    gates,
  };
}

function detectDistanceFromTestName(name: string | null): number | null {
  if (!name) return null;
  const m = name.toLowerCase().match(/(\d+)\s*m/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasMaterialDifference(source: number, calculated: number, tolerance = 0.1): boolean {
  if (!Number.isFinite(source) || !Number.isFinite(calculated)) return false;
  const denominator = Math.max(Math.abs(calculated), 0.001);
  return Math.abs(source - calculated) / denominator > tolerance;
}

@Injectable()
export class PhotocellImportService {
  constructor(private readonly protocols: EvaluationProtocolService) {}

  async getProtocolOptions(): Promise<Array<{ code: string; label: string; category: string }>> {
    const rows = await this.protocols.list('photocells', true);
    return rows.map((p) => ({ code: p.code, label: p.label, category: p.category }));
  }

  async buildPreview(dto: PhotocellImportDto): Promise<PhotocellPreviewResponse> {
    if (!dto.headers?.length) {
      throw new BadRequestException('Faltan encabezados para interpretar la importación');
    }

    const catalog = await this.protocols.list('photocells', true);
    if (!catalog.length) {
      throw new BadRequestException('No hay protocolos de fotocélulas configurados');
    }

    let protocolEntity =
      (dto.protocolCode
        ? await this.protocols.findActiveByDeviceAndCode('photocells', dto.protocolCode)
        : null) ?? null;

    const parsedRows = this.normalizeRows(dto.headers, dto.rows);
    const nonEmptyRows = parsedRows.filter((row) =>
      Object.values(row.raw).some((value) => value != null && String(value).trim() !== ''),
    );
    if (!nonEmptyRows.length) {
      throw new BadRequestException('No hay filas con datos para interpretar');
    }

    const globalWarnings: string[] = [];
    const nameHints = [
      ...new Set(nonEmptyRows.map((r) => r.athleteName).filter((v): v is string => !!v)),
    ];
    if (nameHints.length > 0) {
      globalWarnings.push(
        `El archivo menciona: ${nameHints.slice(0, 3).join(', ')}. Se guardará para el atleta seleccionado en STP.`,
      );
    }

    // Auto-detect protocol if missing or to upgrade sprint splits → longest distance
    const autoProtocol = this.detectProtocolFromRows(nonEmptyRows, catalog);
    if (!protocolEntity && autoProtocol) {
      protocolEntity = autoProtocol;
      globalWarnings.push(`Protocolo detectado automáticamente: ${autoProtocol.label}.`);
    }
    if (!protocolEntity) {
      throw new BadRequestException('Protocolo de fotocélulas no soportado');
    }

    // If user picked a short sprint but rows are a split ladder, upgrade to max gate protocol
    const upgraded = this.maybeUpgradeSprintProtocol(protocolEntity, nonEmptyRows, catalog);
    if (upgraded && upgraded.code !== protocolEntity.code) {
      globalWarnings.push(
        `Se agruparon parciales en ${upgraded.label} (en lugar de crear una evaluación por distancia).`,
      );
      protocolEntity = upgraded;
    }

    const protocol = protocolFromEntity(protocolEntity);
    const evaluations = this.buildCanonicalEvaluations(protocol, nonEmptyRows, dto.evaluationDate);

    if (!evaluations.length) {
      throw new BadRequestException('No se pudo interpretar ninguna evaluación a partir de los datos');
    }

    const first = evaluations[0];
    return {
      sourceType: 'photocell',
      athleteId: dto.athleteId,
      evaluationDate: dto.evaluationDate,
      sourceName: dto.sourceName?.trim() || null,
      preview: {
        headers: dto.headers.slice(0, 20),
        rows: dto.rows.slice(0, 12),
      },
      warnings: [...globalWarnings, ...evaluations.flatMap((e) => e.warnings)],
      evaluations,
      protocolCode: first.protocolCode,
      protocolLabel: first.protocolLabel,
      testType: first.testType,
      metrics: first.metrics,
      repetitions: first.repetitions,
      aggregates: first.aggregates,
      summaryAnalysis: first.summaryAnalysis,
      completeness: first.completeness,
    };
  }

  private detectProtocolFromRows(
    rows: ParsedRow[],
    catalog: EvaluationProtocol[],
  ): EvaluationProtocol | null {
    const distances = [
      ...new Set(
        rows
          .map((r) => r.splitMeters ?? detectDistanceFromTestName(r.testName))
          .filter((d): d is number => d != null && d > 0),
      ),
    ].sort((a, b) => a - b);

    if (distances.length >= 2) {
      const max = distances[distances.length - 1];
      const match = catalog.find((p) => {
        const def = protocolFromEntity(p);
        return def.category === 'speed' && def.distanceMeters === max;
      });
      if (match) return match;
    }

    if (distances.length === 1) {
      const match = catalog.find((p) => protocolFromEntity(p).distanceMeters === distances[0]);
      if (match) return match;
    }

    const testNames = rows.map((r) => (r.testName ?? '').toLowerCase()).join(' ');
    if (testNames.includes('rast')) return catalog.find((p) => p.code === 'rast') ?? null;
    if (testNames.includes('rsa')) return catalog.find((p) => p.code === 'rsa') ?? null;
    if (testNames.includes('505')) return catalog.find((p) => p.code === 'test_505') ?? null;
    if (testNames.includes('illinois')) return catalog.find((p) => p.code === 'illinois') ?? null;
    if (testNames.includes('t-test') || testNames.includes('t test') || testNames.includes('ttest')) {
      return catalog.find((p) => p.code === 't_test') ?? null;
    }
    return null;
  }

  private maybeUpgradeSprintProtocol(
    selected: EvaluationProtocol,
    rows: ParsedRow[],
    catalog: EvaluationProtocol[],
  ): EvaluationProtocol {
    const def = protocolFromEntity(selected);
    if (def.category !== 'speed') return selected;

    const distances = [
      ...new Set(
        rows
          .map((r) => r.splitMeters ?? detectDistanceFromTestName(r.testName))
          .filter((d): d is number => d != null && d > 0),
      ),
    ].sort((a, b) => a - b);

    if (distances.length < 2) return selected;
    const max = distances[distances.length - 1];
    const upgraded = catalog.find((p) => {
      const d = protocolFromEntity(p);
      return d.category === 'speed' && d.distanceMeters === max;
    });
    return upgraded ?? selected;
  }

  private buildCanonicalEvaluations(
    protocol: ProtocolDef,
    rows: ParsedRow[],
    evaluationDate: string,
  ): CanonicalEvaluationPreview[] {
    switch (protocol.category) {
      case 'speed':
        return this.buildSprintEvaluations(protocol, rows, evaluationDate);
      case 'agility':
        return this.buildAgilityEvaluations(protocol, rows, evaluationDate);
      case 'resistance':
        return this.buildResistanceEvaluations(protocol, rows, evaluationDate);
      default:
        throw new BadRequestException('Categoría de protocolo no soportada');
    }
  }

  private normalizeRows(headers: string[], rows: Array<Array<string | null>>): ParsedRow[] {
    const normalizedHeaders = headers.map((header, index) => normalizeHeader(header || `col_${index + 1}`));

    return rows.map((row) => {
      const record: Record<string, string | null> = {};
      normalizedHeaders.forEach((header, index) => {
        const rawValue = row[index];
        record[header] = rawValue == null ? null : String(rawValue).trim();
      });

      const metros = pickNumber(record, ['metros', 'metro', 'distancia', 'distance', 'm']);
      const apellido = pickValue(record, ['apellido', 'lastname', 'last_name']);
      const nombre = pickValue(record, ['nombre', 'name', 'firstname', 'first_name']);
      const athleteName =
        apellido || nombre ? [apellido, nombre].filter(Boolean).join(' ').trim() : pickValue(record, ['atleta', 'athlete', 'jugador']);

      return {
        raw: record,
        testName: pickValue(record, ['nombretest', 'test', 'nombre_test', 'protocol', 'protocolo', 'prueba']),
        athleteName,
        sourceDate: pickValue(record, ['fecha', 'date', 'fecha_test', 'test_date']),
        institution: pickValue(record, ['institucion', 'institution', 'club']),
        sport: pickValue(record, ['deporte', 'sport']),
        age: pickNumber(record, ['edad', 'age']),
        stimulus: pickValue(record, ['estimulo', 'stimulus']),
        sourceNumber: pickNumber(record, ['num', 'numero', 'number']),
        splitIndex: pickNumber(record, ['parcial', 'split_index', 'split_num', 'split']),
        splitMeters: metros != null && metros > 0 ? metros : detectDistanceFromTestName(
          pickValue(record, ['nombretest', 'test', 'nombre_test', 'protocol', 'protocolo', 'prueba']),
        ),
        timeSeconds: pickNumber(record, [
          'tiempoparcial',
          'tiempo_parcial',
          'tiempo',
          'time',
          'tiempo_total',
          'total_time',
        ]),
        velocityMps: pickNumber(record, ['velocidad', 'speed', 'velocidad_media', 'avg_speed']),
        accelerationMps2: pickNumber(record, ['aceleracion', 'acceleration', 'aceleracion_media', 'avg_acceleration']),
        repetitionIndex: pickNumber(record, ['repeticion', 'repeticion_n', 'intento', 'attempt', 'rep']),
        powerWatts: pickNumber(record, ['potencia', 'power', 'potencia_media', 'potencia_maxima']),
        sprintNumber: pickNumber(record, ['sprint', 'sprint_num', 'sprint_number']),
      };
    });
  }

  private detectSprintMeasurementMode(rows: ParsedRow[], protocol: ProtocolDef): 'start_finish' | 'split_profile' {
    const withTime = rows.filter((r) => r.timeSeconds != null);
    if (withTime.length < 2) return 'start_finish';

    const withMetros = withTime.filter((r) => r.splitMeters != null && r.splitMeters > 0);
    if (withMetros.length >= 2) {
      const sorted = [...withMetros].sort((a, b) => (a.splitMeters ?? 0) - (b.splitMeters ?? 0));
      const metros = sorted.map((r) => r.splitMeters!);
      const uniqueMetros = [...new Set(metros)];
      const increasing = uniqueMetros.every((m, i) => i === 0 || m > uniqueMetros[i - 1]);
      if (uniqueMetros.length >= 2 && increasing) {
        const times = sorted.map((r) => r.timeSeconds!);
        const monotonic = times.every((t, i) => i === 0 || t >= times[i - 1]);
        if (monotonic) return 'split_profile';
      }
    }

    const gateProfile = protocol.gates;
    if (gateProfile && gateProfile.length >= 2 && withTime.length === gateProfile.length) {
      const times = withTime.map((r) => r.timeSeconds!);
      const monotonic = times.every((t, i) => i === 0 || t >= times[i - 1]);
      if (monotonic) return 'split_profile';
    }

    return 'start_finish';
  }

  private buildSprintEvaluations(
    protocol: ProtocolDef,
    rows: ParsedRow[],
    evaluationDate: string,
  ): CanonicalEvaluationPreview[] {
    const mode = this.detectSprintMeasurementMode(rows, protocol);
    if (mode === 'split_profile') {
      return [this.buildSprintSplitProfile(protocol, rows, evaluationDate)];
    }
    return this.buildSprintStartFinishAttempts(protocol, rows, evaluationDate);
  }

  /** Cada intento = una evaluación canónica. */
  private buildSprintStartFinishAttempts(
    protocol: ProtocolDef,
    rows: ParsedRow[],
    evaluationDate: string,
  ): CanonicalEvaluationPreview[] {
    const protocolDistance = protocol.distanceMeters ?? null;
    const attempts = rows
      .map((row, index) => {
        if (row.timeSeconds == null) return null;
        const attemptNumber = row.repetitionIndex ?? row.splitIndex ?? index + 1;
        const distance = row.splitMeters ?? protocolDistance;
        const calculatedVelocity =
          distance != null && distance > 0 && row.timeSeconds > 0
            ? round3(distance / row.timeSeconds)
            : null;
        const warnings: string[] = [];
        if (
          row.velocityMps != null &&
          calculatedVelocity != null &&
          hasMaterialDifference(row.velocityMps, calculatedVelocity)
        ) {
          warnings.push(
            `La velocidad informada (${row.velocityMps.toFixed(3)} m/s) no coincide con distancia ÷ tiempo (${calculatedVelocity.toFixed(3)} m/s). Se usó la velocidad recalculada.`,
          );
        }
        return {
          attemptNumber,
          distance,
          timeSeconds: round3(row.timeSeconds)!,
          velocityMps: calculatedVelocity ?? row.velocityMps,
          sourceVelocityMps: row.velocityMps,
          // La definición de "Aceleración" depende del software. Se conserva
          // como dato fuente, pero no se inventa a partir de velocidad/tiempo.
          sourceAccelerationMps2: row.accelerationMps2,
          sourceContext: {
            athleteName: row.athleteName,
            sourceDate: row.sourceDate,
            institution: row.institution,
            sport: row.sport,
            age: row.age,
            stimulus: row.stimulus,
            sourceNumber: row.sourceNumber,
            testName: row.testName,
          },
          warnings,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);

    if (!attempts.length) {
      throw new BadRequestException('No se encontraron tiempos válidos para el sprint');
    }

    return attempts.map((attempt) => {
      const measurements: CanonicalMeasurement[] = [
        {
          partial: 1,
          distance: attempt.distance,
          time: attempt.timeSeconds,
          velocity: attempt.velocityMps,
          acceleration: attempt.sourceAccelerationMps2,
          power: null,
          label: `${attempt.distance ?? '?'} m`,
          extras: {
            sourceVelocityMps: attempt.sourceVelocityMps,
            sourceAccelerationMps2: attempt.sourceAccelerationMps2,
            velocitySource:
              attempt.distance != null && attempt.timeSeconds > 0
                ? 'calculated_distance_over_time'
                : 'source',
          },
        },
      ];
      const derivedMetrics: Record<string, number | null> = {
        totalTimeSeconds: attempt.timeSeconds,
        avgVelocityMps: attempt.velocityMps,
        maxVelocityMps: attempt.velocityMps,
        avgAccelerationMps2: attempt.sourceAccelerationMps2,
      };
      const metrics: Record<string, unknown> = {
        sourceType: 'photocell',
        measurementMode: 'start_finish' satisfies PhotocellMeasurementMode,
        protocolCode: protocol.code,
        protocolLabel: protocol.label,
        totalDistanceMeters: attempt.distance,
        gates:
          attempt.distance != null
            ? [{ meters: 0 }, { meters: attempt.distance }]
            : [{ meters: 0 }],
        attemptCount: 1,
        bestTimeSeconds: attempt.timeSeconds,
        totalTimeSeconds: attempt.timeSeconds,
        avgVelocityMps: attempt.velocityMps,
        maxVelocityMps: attempt.velocityMps,
        avgAccelerationMps2: attempt.sourceAccelerationMps2,
        sourceVelocityMps: attempt.sourceVelocityMps,
        sourceAccelerationMps2: attempt.sourceAccelerationMps2,
        sourceContext: attempt.sourceContext,
        velocitySource:
          attempt.distance != null && attempt.timeSeconds > 0
            ? 'calculated_distance_over_time'
            : 'source',
      };
      return {
        protocolCode: protocol.code,
        protocolLabel: protocol.label,
        testType: protocol.testType,
        evaluationDate,
        attempt: attempt.attemptNumber,
        measurementMode: 'start_finish' as const,
        measurements,
        derivedMetrics,
        metrics,
        repetitions: [
          {
            label: `Intento ${attempt.attemptNumber}`,
            attemptNumber: attempt.attemptNumber,
            distanceMeters: attempt.distance,
            timeSeconds: attempt.timeSeconds,
            velocityMps: attempt.velocityMps,
            sourceVelocityMps: attempt.sourceVelocityMps,
            sourceAccelerationMps2: attempt.sourceAccelerationMps2,
            sourceContext: attempt.sourceContext,
          },
        ],
        aggregates: {},
        summaryAnalysis: [
          `Evaluación de fotocélulas: ${protocol.label}.`,
          `Intento ${attempt.attemptNumber}: ${attempt.timeSeconds.toFixed(3)} s.`,
          attempt.velocityMps != null ? `Velocidad media ${attempt.velocityMps.toFixed(3)} m/s.` : null,
        ]
          .filter(Boolean)
          .join(' '),
        completeness: this.computeCompleteness([
          attempt.timeSeconds,
          attempt.velocityMps,
          attempt.distance,
        ]),
        warnings: attempt.warnings,
      };
    });
  }

  private buildSprintSplitProfile(
    protocol: ProtocolDef,
    rows: ParsedRow[],
    evaluationDate: string,
  ): CanonicalEvaluationPreview {
    const warnings: string[] = [];
    const distance = protocol.distanceMeters ?? null;
    const gateProfile = protocol.gates;

    const usable = rows
      .map((row, index) => {
        const splitIndex = row.splitIndex ?? index + 1;
        let splitMeters = row.splitMeters;
        if ((splitMeters == null || splitMeters <= 0) && gateProfile && splitIndex >= 1 && splitIndex <= gateProfile.length) {
          splitMeters = gateProfile[splitIndex - 1];
        }
        return {
          splitIndex,
          splitMeters,
          timeSeconds: row.timeSeconds,
        sourceVelocityMps: row.velocityMps,
        sourceAccelerationMps2: row.accelerationMps2,
        };
      })
      .filter((entry) => entry.timeSeconds != null && entry.splitMeters != null && entry.splitMeters > 0);

    if (usable.length < 2) {
      throw new BadRequestException(
        'No se pudo interpretar el perfil de splits; verificá la columna Metros o usá un sprint inicio–meta.',
      );
    }

    usable.sort((a, b) => (a.splitMeters ?? 0) - (b.splitMeters ?? 0));

    // Deduplicate same distance keeping last cumulative time
    const byDistance = new Map<number, (typeof usable)[number]>();
    for (const entry of usable) {
      byDistance.set(entry.splitMeters!, entry);
    }
    const unique = [...byDistance.values()].sort((a, b) => (a.splitMeters ?? 0) - (b.splitMeters ?? 0));

    const measurements: CanonicalMeasurement[] = unique.map((entry, index) => {
      const prevTime = index > 0 ? unique[index - 1].timeSeconds! : 0;
      const cumulativeTime = entry.timeSeconds!;
      const segmentTime = round3(cumulativeTime - prevTime);
      const prevMeters = index > 0 ? unique[index - 1].splitMeters! : 0;
      const segmentMeters = (entry.splitMeters ?? 0) - prevMeters;
      const velocity =
        segmentMeters > 0 && segmentTime != null && segmentTime > 0
          ? round3(segmentMeters / segmentTime)
          : entry.sourceVelocityMps;
      if (
        entry.sourceVelocityMps != null &&
        velocity != null &&
        hasMaterialDifference(entry.sourceVelocityMps, velocity)
      ) {
        warnings.push(
          `${entry.splitMeters} m: velocidad informada ${entry.sourceVelocityMps.toFixed(3)} m/s; recalculada ${velocity.toFixed(3)} m/s.`,
        );
      }
      return {
        partial: entry.splitIndex,
        distance: entry.splitMeters,
        time: round3(cumulativeTime),
        velocity,
        acceleration: entry.sourceAccelerationMps2,
        power: null,
        label: `${entry.splitMeters} m`,
        extras: {
          cumulativeTimeSeconds: round3(cumulativeTime),
          segmentTimeSeconds: segmentTime,
          segmentMeters,
          sourceVelocityMps: entry.sourceVelocityMps,
          sourceAccelerationMps2: entry.sourceAccelerationMps2,
          velocitySource: 'calculated_segment_distance_over_time',
        },
      };
    });

    const totalTime = measurements[measurements.length - 1]?.time ?? null;
    const velocities = measurements.map((m) => m.velocity).filter((v): v is number => v != null);
    const accelerations = measurements.map((m) => m.acceleration).filter((v): v is number => v != null);
    const totalDistance = distance ?? unique[unique.length - 1]?.splitMeters ?? null;

    const derivedMetrics: Record<string, number | null> = {
      totalTimeSeconds: totalTime,
      avgVelocityMps:
        totalTime && totalDistance ? round3(totalDistance / totalTime) : average(velocities),
      maxVelocityMps: velocities.length ? round3(Math.max(...velocities)) : null,
      avgAccelerationMps2: accelerations.length ? average(accelerations) : null,
    };

    const repetitions = measurements.map((m) => ({
      label: m.label,
      splitIndex: m.partial,
      splitMeters: m.distance,
      cumulativeTimeSeconds: m.extras?.cumulativeTimeSeconds ?? m.time,
      segmentTimeSeconds: m.extras?.segmentTimeSeconds ?? null,
      velocityMps: m.velocity,
      accelerationMps2: m.acceleration,
    }));

    const metrics: Record<string, unknown> = {
      sourceType: 'photocell',
      measurementMode: 'split_profile' satisfies PhotocellMeasurementMode,
      protocolCode: protocol.code,
      protocolLabel: protocol.label,
      totalDistanceMeters: totalDistance,
      gates: [0, ...unique.map((u) => u.splitMeters!)].map((meters) => ({ meters })),
      splitCount: measurements.length,
      ...derivedMetrics,
    };

    if (rows.length > unique.length) {
      warnings.push(`Se consolidaron ${rows.length} filas en ${unique.length} parciales de distancia.`);
    }

    return {
      protocolCode: protocol.code,
      protocolLabel: protocol.label,
      testType: protocol.testType,
      evaluationDate,
      attempt: 1,
      measurementMode: 'split_profile',
      measurements,
      derivedMetrics,
      metrics,
      repetitions,
      aggregates: {},
      summaryAnalysis: [
        `Evaluación de fotocélulas: ${protocol.label} con ${measurements.length} parciales.`,
        totalTime != null ? `Tiempo total ${Number(totalTime).toFixed(3)} s.` : null,
        derivedMetrics.avgVelocityMps != null
          ? `Velocidad media ${Number(derivedMetrics.avgVelocityMps).toFixed(3)} m/s.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      completeness: this.computeCompleteness([totalTime, derivedMetrics.avgVelocityMps, measurements.length]),
      warnings,
    };
  }

  private buildAgilityEvaluations(
    protocol: ProtocolDef,
    rows: ParsedRow[],
    evaluationDate: string,
  ): CanonicalEvaluationPreview[] {
    const usable = rows
      .map((row, index) => ({
        attemptNumber: row.repetitionIndex ?? index + 1,
        timeSeconds: row.timeSeconds,
      }))
      .filter((entry) => entry.timeSeconds != null) as Array<{ attemptNumber: number; timeSeconds: number }>;

    if (!usable.length) {
      throw new BadRequestException('No se encontraron tiempos válidos para la prueba de cambio de dirección');
    }

    return usable.map((entry) => {
      const time = round3(entry.timeSeconds)!;
      const measurements: CanonicalMeasurement[] = [
        {
          partial: 1,
          distance: null,
          time,
          velocity: null,
          acceleration: null,
          power: null,
          label: `Intento ${entry.attemptNumber}`,
        },
      ];
      const derivedMetrics = {
        bestTimeSeconds: time,
        avgTimeSeconds: time,
        worstTimeSeconds: time,
        totalTimeSeconds: time,
      };
      return {
        protocolCode: protocol.code,
        protocolLabel: protocol.label,
        testType: protocol.testType,
        evaluationDate,
        attempt: entry.attemptNumber,
        measurementMode: 'repeated_attempts' as const,
        measurements,
        derivedMetrics,
        metrics: {
          sourceType: 'photocell',
          measurementMode: 'repeated_attempts',
          protocolCode: protocol.code,
          protocolLabel: protocol.label,
          attemptCount: 1,
          ...derivedMetrics,
        },
        repetitions: [{ label: `Intento ${entry.attemptNumber}`, timeSeconds: time }],
        aggregates: {},
        summaryAnalysis: `Evaluación de fotocélulas: ${protocol.label}. Intento ${entry.attemptNumber}: ${time.toFixed(3)} s.`,
        completeness: this.computeCompleteness([time]),
        warnings: [],
      };
    });
  }

  private buildResistanceEvaluations(
    protocol: ProtocolDef,
    rows: ParsedRow[],
    evaluationDate: string,
  ): CanonicalEvaluationPreview[] {
    const usable = rows
      .map((row, index) => ({
        sprintNumber: row.sprintNumber ?? row.repetitionIndex ?? row.splitIndex ?? index + 1,
        timeSeconds: row.timeSeconds,
        powerWatts: row.powerWatts,
      }))
      .filter((entry) => entry.timeSeconds != null) as Array<{
      sprintNumber: number;
      timeSeconds: number;
      powerWatts: number | null;
    }>;

    if (!usable.length) {
      throw new BadRequestException('No se encontraron tiempos válidos para el protocolo de resistencia');
    }

    const times = usable.map((e) => e.timeSeconds);
    const powers = usable.map((e) => e.powerWatts).filter((v): v is number => v != null);
    const best = Math.min(...times);
    const worst = Math.max(...times);
    const fatigueIndex = best > 0 ? round3(((worst - best) / best) * 100) : null;

    const measurements: CanonicalMeasurement[] = usable.map((entry) => ({
      partial: entry.sprintNumber,
      distance: null,
      time: round3(entry.timeSeconds),
      velocity: null,
      acceleration: null,
      power: entry.powerWatts != null ? round3(entry.powerWatts) : null,
      label: `Sprint ${entry.sprintNumber}`,
    }));

    const derivedMetrics: Record<string, number | null> = {
      bestSprintSeconds: round3(best),
      worstSprintSeconds: round3(worst),
      avgSprintSeconds: average(times),
      fatigueIndexPct: fatigueIndex,
      maxPowerWatts: powers.length ? round3(Math.max(...powers)) : null,
      avgPowerWatts: powers.length ? average(powers) : null,
      minPowerWatts: powers.length ? round3(Math.min(...powers)) : null,
    };

    const warnings: string[] = [];
    if (!powers.length) {
      warnings.push('No se detectó potencia en el archivo; solo se calcularon métricas basadas en tiempos.');
    }

    return [
      {
        protocolCode: protocol.code,
        protocolLabel: protocol.label,
        testType: protocol.testType,
        evaluationDate,
        attempt: 1,
        measurementMode: 'repeated_sprints',
        measurements,
        derivedMetrics,
        metrics: {
          sourceType: 'photocell',
          measurementMode: 'repeated_sprints',
          protocolCode: protocol.code,
          protocolLabel: protocol.label,
          sprintCount: usable.length,
          ...derivedMetrics,
        },
        repetitions: measurements.map((m) => ({
          label: m.label,
          timeSeconds: m.time,
          powerWatts: m.power,
        })),
        aggregates: {
          timeSeconds: metricStat(times, false),
          ...(powers.length ? { powerWatts: metricStat(powers, true) } : {}),
        },
        summaryAnalysis: [
          `Evaluación de fotocélulas: ${protocol.label}.`,
          `Mejor sprint ${best.toFixed(3)} s.`,
          `Peor sprint ${worst.toFixed(3)} s.`,
          average(times) != null ? `Promedio ${average(times)!.toFixed(3)} s.` : null,
          fatigueIndex != null ? `Índice de fatiga ${fatigueIndex.toFixed(3)}%.` : null,
        ]
          .filter(Boolean)
          .join(' '),
        completeness: this.computeCompleteness([
          derivedMetrics.bestSprintSeconds,
          derivedMetrics.avgSprintSeconds,
          derivedMetrics.fatigueIndexPct,
        ]),
        warnings,
      },
    ];
  }

  private computeCompleteness(values: unknown[]): number {
    const total = values.length;
    const ok = values.filter((value) => value != null).length;
    return total > 0 ? Math.round((ok / total) * 100) : 0;
  }
}
