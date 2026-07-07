import { BadRequestException, Injectable } from '@nestjs/common';
import { PhotocellImportDto } from './dto/photocell-import.dto';

type PhotocellProtocolCategory = 'speed' | 'agility' | 'resistance';

export type PhotocellMeasurementMode =
  | 'start_finish'
  | 'split_profile'
  | 'repeated_attempts'
  | 'repeated_sprints';

type ProtocolDef = {
  code: string;
  label: string;
  testType: string;
  category: PhotocellProtocolCategory;
  distanceMeters?: number;
};

type ParsedRow = {
  raw: Record<string, string | null>;
  testName: string | null;
  splitIndex: number | null;
  splitMeters: number | null;
  timeSeconds: number | null;
  velocityMps: number | null;
  accelerationMps2: number | null;
  repetitionIndex: number | null;
  powerWatts: number | null;
  sprintNumber: number | null;
};

/** Perfiles de gates intermedios (futuro: fotocélula extra). Se usa si hay parciales sin columna Metros. */
const SPRINT_SPLIT_GATE_PROFILES: Record<string, number[]> = {
  sprint_50m: [10, 20, 30, 40, 50],
};

export type PhotocellPreviewResponse = {
  sourceType: 'photocell';
  protocolCode: string;
  protocolLabel: string;
  testType: string;
  athleteId: string;
  evaluationDate: string;
  sourceName: string | null;
  preview: {
    headers: string[];
    rows: Array<Array<string | null>>;
  };
  warnings: string[];
  metrics: Record<string, unknown>;
  repetitions: Array<Record<string, unknown>>;
  aggregates: Record<string, unknown>;
  summaryAnalysis: string;
  completeness: number;
};

const PROTOCOLS: Record<string, ProtocolDef> = {
  sprint_10m: {
    code: 'sprint_10m',
    label: 'Sprint 10 m',
    testType: 'photocell_sprint_10m',
    category: 'speed',
    distanceMeters: 10,
  },
  sprint_20m: {
    code: 'sprint_20m',
    label: 'Sprint 20 m',
    testType: 'photocell_sprint_20m',
    category: 'speed',
    distanceMeters: 20,
  },
  sprint_30m: {
    code: 'sprint_30m',
    label: 'Sprint 30 m',
    testType: 'photocell_sprint_30m',
    category: 'speed',
    distanceMeters: 30,
  },
  sprint_40m: {
    code: 'sprint_40m',
    label: 'Sprint 40 m',
    testType: 'photocell_sprint_40m',
    category: 'speed',
    distanceMeters: 40,
  },
  sprint_50m: {
    code: 'sprint_50m',
    label: 'Sprint 50 m',
    testType: 'photocell_sprint_50m',
    category: 'speed',
    distanceMeters: 50,
  },
  t_test: {
    code: 't_test',
    label: 'T-Test',
    testType: 'photocell_t_test',
    category: 'agility',
  },
  test_505: {
    code: 'test_505',
    label: '505',
    testType: 'photocell_505',
    category: 'agility',
  },
  illinois: {
    code: 'illinois',
    label: 'Illinois',
    testType: 'photocell_illinois',
    category: 'agility',
  },
  rast: {
    code: 'rast',
    label: 'RAST',
    testType: 'photocell_rast',
    category: 'resistance',
  },
  rsa: {
    code: 'rsa',
    label: 'RSA',
    testType: 'photocell_rsa',
    category: 'resistance',
  },
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

@Injectable()
export class PhotocellImportService {
  getProtocolOptions(): Array<{ code: string; label: string; category: PhotocellProtocolCategory }> {
    return Object.values(PROTOCOLS).map((protocol) => ({
      code: protocol.code,
      label: protocol.label,
      category: protocol.category,
    }));
  }

  buildPreview(dto: PhotocellImportDto): PhotocellPreviewResponse {
    const protocol = PROTOCOLS[dto.protocolCode];
    if (!protocol) {
      throw new BadRequestException('Protocolo de fotocélulas no soportado');
    }
    if (!dto.headers?.length) {
      throw new BadRequestException('Faltan encabezados para interpretar la importación');
    }

    const parsedRows = this.normalizeRows(dto.headers, dto.rows);
    const nonEmptyRows = parsedRows.filter((row) =>
      Object.values(row.raw).some((value) => value != null && String(value).trim() !== ''),
    );
    if (!nonEmptyRows.length) {
      throw new BadRequestException('No hay filas con datos para interpretar');
    }

    const interpreted = this.interpretByProtocol(protocol, nonEmptyRows);
    return {
      sourceType: 'photocell',
      protocolCode: protocol.code,
      protocolLabel: protocol.label,
      testType: protocol.testType,
      athleteId: dto.athleteId,
      evaluationDate: dto.evaluationDate,
      sourceName: dto.sourceName?.trim() || null,
      preview: {
        headers: dto.headers.slice(0, 20),
        rows: dto.rows.slice(0, 12),
      },
      warnings: interpreted.warnings,
      metrics: interpreted.metrics,
      repetitions: interpreted.repetitions,
      aggregates: interpreted.aggregates,
      summaryAnalysis: interpreted.summaryAnalysis,
      completeness: interpreted.completeness,
    };
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
      return {
        raw: record,
        testName: pickValue(record, ['nombretest', 'test', 'nombre_test', 'protocol', 'protocolo', 'prueba']),
        splitIndex: pickNumber(record, ['parcial', 'split_index', 'split_num', 'split']),
        splitMeters: metros != null && metros > 0 ? metros : null,
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

  private interpretByProtocol(protocol: ProtocolDef, rows: ParsedRow[]) {
    switch (protocol.category) {
      case 'speed':
        return this.buildSprintPreview(protocol, rows);
      case 'agility':
        return this.buildAgilityPreview(protocol, rows);
      case 'resistance':
        return this.buildResistancePreview(protocol, rows);
      default:
        throw new BadRequestException('Categoría de protocolo no soportada');
    }
  }

  /**
   * Sprint con gates intermedios: varias filas, metros crecientes y tiempos acumulativos.
   * Si no aplica → start_finish (0 m → meta; varias filas = varios intentos).
   */
  private detectSprintMeasurementMode(
    rows: ParsedRow[],
    protocol: ProtocolDef,
  ): 'start_finish' | 'split_profile' {
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

    const gateProfile = SPRINT_SPLIT_GATE_PROFILES[protocol.code];
    if (gateProfile && withTime.length === gateProfile.length) {
      const partials = withTime.map((r, i) => r.splitIndex ?? i + 1);
      const matchesPartials = partials.every((p, i) => p === i + 1);
      const times = withTime.map((r) => r.timeSeconds!);
      const monotonic = times.every((t, i) => i === 0 || t >= times[i - 1]);
      if (matchesPartials && monotonic) return 'split_profile';
    }

    return 'start_finish';
  }

  private buildSprintGates(distance: number | null, splitMeters: number[]): Array<{ meters: number }> {
    if (splitMeters.length > 0) {
      const points = [0, ...splitMeters];
      return [...new Set(points)].sort((a, b) => a - b).map((meters) => ({ meters }));
    }
    if (distance != null) return [{ meters: 0 }, { meters: distance }];
    return [{ meters: 0 }];
  }

  private buildSprintPreview(protocol: ProtocolDef, rows: ParsedRow[]) {
    const mode = this.detectSprintMeasurementMode(rows, protocol);
    if (mode === 'split_profile') {
      return this.buildSprintSplitProfile(protocol, rows);
    }
    return this.buildSprintStartFinish(protocol, rows);
  }

  /** 0 m → meta. Cada fila = un intento completo (no un split intermedio). */
  private buildSprintStartFinish(protocol: ProtocolDef, rows: ParsedRow[]) {
    const warnings: string[] = [];
    const distance = protocol.distanceMeters ?? null;
    const gates = this.buildSprintGates(distance, []);

    const attempts = rows
      .map((row, index) => {
        if (row.timeSeconds == null) return null;
        const attemptNumber = row.repetitionIndex ?? row.splitIndex ?? index + 1;
        let velocity = row.velocityMps;
        if (velocity == null && distance != null && row.timeSeconds > 0) {
          velocity = round3(distance / row.timeSeconds);
        }
        return {
          label: `Intento ${attemptNumber}`,
          attemptNumber,
          distanceMeters: distance,
          timeSeconds: round3(row.timeSeconds),
          velocityMps: velocity,
          accelerationMps2: row.accelerationMps2 ?? null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);

    if (!attempts.length) {
      throw new BadRequestException('No se encontraron tiempos válidos para el sprint');
    }

    const times = attempts.map((a) => a.timeSeconds as number);
    const best = Math.min(...times);
    const worst = Math.max(...times);
    const bestAttempt = attempts.find((a) => a.timeSeconds === best) ?? attempts[0];
    const velocities = attempts
      .map((a) => a.velocityMps)
      .filter((v): v is number => v != null);

    if (rows.length > attempts.length) {
      warnings.push(`Se omitieron ${rows.length - attempts.length} fila(s) sin tiempo interpretable.`);
    }
    if (attempts.length > 1) {
      warnings.push(
        `Se detectaron ${attempts.length} intentos; el tiempo de referencia es el mejor (${best.toFixed(3)} s).`,
      );
    }

    const headlineVelocity =
      bestAttempt.velocityMps ??
      (distance != null && best > 0 ? round3(distance / best) : average(velocities));

    const metrics: Record<string, unknown> = {
      sourceType: 'photocell',
      measurementMode: 'start_finish' satisfies PhotocellMeasurementMode,
      protocolCode: protocol.code,
      protocolLabel: protocol.label,
      totalDistanceMeters: distance,
      gates,
      attemptCount: attempts.length,
      bestTimeSeconds: round3(best),
      worstTimeSeconds: round3(worst),
      avgTimeSeconds: average(times),
      totalTimeSeconds: round3(best),
      avgVelocityMps: headlineVelocity,
      maxVelocityMps: velocities.length ? round3(Math.max(...velocities)) : headlineVelocity,
      sourceRowCount: rows.length,
      parsedRowCount: attempts.length,
    };

    const summaryParts = [
      `Evaluación de fotocélulas: ${protocol.label} (salida 0 m → ${distance ?? '?'} m).`,
      `Mejor tiempo ${best.toFixed(3)} s.`,
    ];
    if (headlineVelocity != null) {
      summaryParts.push(`Velocidad media ${headlineVelocity.toFixed(3)} m/s.`);
    }
    if (attempts.length === 1) {
      summaryParts.push('1 intento registrado.');
    } else {
      summaryParts.push(`${attempts.length} intentos registrados.`);
    }

    return {
      warnings,
      metrics,
      repetitions: attempts,
      aggregates: attempts.length > 1 ? { timeSeconds: metricStat(times, false) } : {},
      summaryAnalysis: summaryParts.join(' '),
      completeness: this.computeCompleteness([
        metrics.bestTimeSeconds,
        metrics.avgVelocityMps,
        distance,
      ]),
    };
  }

  /** Varias filas con gates intermedios en un mismo intento (fotocélulas extra). */
  private buildSprintSplitProfile(protocol: ProtocolDef, rows: ParsedRow[]) {
    const warnings: string[] = [];
    const distance = protocol.distanceMeters ?? null;
    const gateProfile = SPRINT_SPLIT_GATE_PROFILES[protocol.code];

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
          velocityMps: row.velocityMps,
          accelerationMps2: row.accelerationMps2,
        };
      })
      .filter((entry) => entry.timeSeconds != null && entry.splitMeters != null && entry.splitMeters > 0);

    if (usable.length < 2) {
      throw new BadRequestException(
        'No se pudo interpretar el perfil de splits; verificá la columna Metros o usá un sprint inicio–meta.',
      );
    }

    usable.sort((a, b) => (a.splitMeters ?? 0) - (b.splitMeters ?? 0));

    const repetitions = usable.map((entry, index) => {
      const prevTime = index > 0 ? usable[index - 1].timeSeconds! : 0;
      const cumulativeTime = entry.timeSeconds!;
      const segmentTime = round3(cumulativeTime - prevTime);
      const prevMeters = index > 0 ? usable[index - 1].splitMeters! : 0;
      const segmentMeters = (entry.splitMeters ?? 0) - prevMeters;
      let velocity = entry.velocityMps;
      if (velocity == null && segmentMeters > 0 && segmentTime != null && segmentTime > 0) {
        velocity = round3(segmentMeters / segmentTime);
      }
      return {
        label: `${entry.splitMeters} m`,
        splitIndex: entry.splitIndex,
        splitMeters: entry.splitMeters,
        cumulativeTimeSeconds: round3(cumulativeTime),
        segmentTimeSeconds: segmentTime,
        velocityMps: velocity,
        accelerationMps2: entry.accelerationMps2 ?? null,
      };
    });

    const totalTime = repetitions[repetitions.length - 1]?.cumulativeTimeSeconds ?? null;
    const splitMetersList = usable.map((u) => u.splitMeters!);
    const gates = this.buildSprintGates(distance, splitMetersList);
    const velocities = repetitions
      .map((r) => r.velocityMps)
      .filter((v): v is number => v != null);

    const metrics: Record<string, unknown> = {
      sourceType: 'photocell',
      measurementMode: 'split_profile' satisfies PhotocellMeasurementMode,
      protocolCode: protocol.code,
      protocolLabel: protocol.label,
      totalDistanceMeters: distance ?? splitMetersList[splitMetersList.length - 1],
      gates,
      splitCount: repetitions.length,
      totalTimeSeconds: totalTime,
      avgVelocityMps:
        velocities.length > 0
          ? average(velocities)
          : totalTime && distance
            ? round3(distance / totalTime)
            : null,
      maxVelocityMps: velocities.length ? round3(Math.max(...velocities)) : null,
      sourceRowCount: rows.length,
      parsedRowCount: usable.length,
    };

    return {
      warnings,
      metrics,
      repetitions,
      aggregates: {},
      summaryAnalysis: [
        `Evaluación de fotocélulas: ${protocol.label} con ${repetitions.length} splits.`,
        totalTime != null ? `Tiempo total ${Number(totalTime).toFixed(3)} s.` : null,
        metrics.avgVelocityMps != null
          ? `Velocidad media ${Number(metrics.avgVelocityMps).toFixed(3)} m/s.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      completeness: this.computeCompleteness([totalTime, metrics.avgVelocityMps, repetitions.length]),
    };
  }

  private buildAgilityPreview(protocol: ProtocolDef, rows: ParsedRow[]) {
    const usable = rows
      .map((row, index) => ({
        label: row.repetitionIndex != null ? `Intento ${row.repetitionIndex}` : `Intento ${index + 1}`,
        timeSeconds: row.timeSeconds,
      }))
      .filter((entry) => entry.timeSeconds != null) as Array<{ label: string; timeSeconds: number }>;

    if (!usable.length) {
      throw new BadRequestException('No se encontraron tiempos válidos para la prueba de cambio de dirección');
    }

    const times = usable.map((entry) => entry.timeSeconds);
    const metrics: Record<string, unknown> = {
      sourceType: 'photocell',
      measurementMode: 'repeated_attempts' satisfies PhotocellMeasurementMode,
      protocolCode: protocol.code,
      protocolLabel: protocol.label,
      attemptCount: usable.length,
      bestTimeSeconds: round3(Math.min(...times)),
      avgTimeSeconds: average(times),
      worstTimeSeconds: round3(Math.max(...times)),
      sourceRowCount: rows.length,
      parsedRowCount: usable.length,
    };

    const summaryAnalysis = [
      `Evaluación de fotocélulas: ${protocol.label}.`,
      `Mejor intento ${Math.min(...times).toFixed(3)} s.`,
      `Promedio ${average(times)?.toFixed(3)} s.`,
      `Se interpretaron ${usable.length} intento(s).`,
    ].join(' ');

    return {
      warnings:
        rows.length > usable.length
          ? [`Se omitieron ${rows.length - usable.length} fila(s) sin tiempo interpretable.`]
          : [],
      metrics,
      repetitions: usable.map((entry) => ({
        label: entry.label,
        timeSeconds: round3(entry.timeSeconds),
      })),
      aggregates: {
        timeSeconds: metricStat(times, false),
      },
      summaryAnalysis,
      completeness: this.computeCompleteness([metrics.bestTimeSeconds, metrics.avgTimeSeconds]),
    };
  }

  private buildResistancePreview(protocol: ProtocolDef, rows: ParsedRow[]) {
    const usable = rows
      .map((row, index) => ({
        label:
          row.sprintNumber != null
            ? `Sprint ${row.sprintNumber}`
            : row.repetitionIndex != null
              ? `Sprint ${row.repetitionIndex}`
              : row.splitIndex != null
                ? `Sprint ${row.splitIndex}`
                : `Sprint ${index + 1}`,
        timeSeconds: row.timeSeconds,
        powerWatts: row.powerWatts,
      }))
      .filter((entry) => entry.timeSeconds != null) as Array<{
      label: string;
      timeSeconds: number;
      powerWatts: number | null;
    }>;

    if (!usable.length) {
      throw new BadRequestException('No se encontraron tiempos válidos para el protocolo de resistencia');
    }

    const times = usable.map((entry) => entry.timeSeconds);
    const powers = usable.map((entry) => entry.powerWatts).filter((value): value is number => value != null);
    const best = Math.min(...times);
    const worst = Math.max(...times);
    const fatigueIndex = best > 0 ? round3(((worst - best) / best) * 100) : null;

    const metrics: Record<string, unknown> = {
      sourceType: 'photocell',
      measurementMode: 'repeated_sprints' satisfies PhotocellMeasurementMode,
      protocolCode: protocol.code,
      protocolLabel: protocol.label,
      sprintCount: usable.length,
      bestSprintSeconds: round3(best),
      worstSprintSeconds: round3(worst),
      avgSprintSeconds: average(times),
      fatigueIndexPct: fatigueIndex,
      maxPowerWatts: powers.length ? round3(Math.max(...powers)) : null,
      avgPowerWatts: powers.length ? average(powers) : null,
      minPowerWatts: powers.length ? round3(Math.min(...powers)) : null,
      sourceRowCount: rows.length,
      parsedRowCount: usable.length,
    };

    const warnings: string[] = [];
    if (!powers.length) {
      warnings.push('No se detectó potencia en el archivo; solo se calcularon métricas basadas en tiempos.');
    }
    if (rows.length > usable.length) {
      warnings.push(`Se omitieron ${rows.length - usable.length} fila(s) sin tiempo interpretable.`);
    }

    const summaryAnalysis = [
      `Evaluación de fotocélulas: ${protocol.label}.`,
      `Mejor sprint ${best.toFixed(3)} s.`,
      `Peor sprint ${worst.toFixed(3)} s.`,
      average(times) != null ? `Promedio ${average(times)!.toFixed(3)} s.` : null,
      fatigueIndex != null ? `Índice de fatiga ${fatigueIndex.toFixed(3)}%.` : null,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      warnings,
      metrics,
      repetitions: usable.map((entry) => ({
        label: entry.label,
        timeSeconds: round3(entry.timeSeconds),
        powerWatts: entry.powerWatts != null ? round3(entry.powerWatts) : null,
      })),
      aggregates: {
        timeSeconds: metricStat(times, false),
        ...(powers.length ? { powerWatts: metricStat(powers, true) } : {}),
      },
      summaryAnalysis,
      completeness: this.computeCompleteness([
        metrics.bestSprintSeconds,
        metrics.avgSprintSeconds,
        metrics.fatigueIndexPct,
      ]),
    };
  }

  private computeCompleteness(values: unknown[]): number {
    const total = values.length;
    const ok = values.filter((value) => value != null).length;
    return total > 0 ? Math.round((ok / total) * 100) : 0;
  }
}
