import { Injectable } from '@nestjs/common';
import {
  CriteriaThreshold,
  EvaluationCriteriaSet,
} from 'src/entities/evaluation-criteria-set.entity';

export type PerformanceTrafficStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface PerformanceClassificationResult {
  metricKey: string;
  value: number;
  status: PerformanceTrafficStatus;
  message: string;
  unit?: string;
  threshold: CriteriaThreshold;
}

export interface PerformanceClassificationSnapshot {
  classifierVersion: '1.0';
  referenceSetId: string;
  referenceCode: string;
  referenceName: string;
  referenceVersion: string;
  protocolCode: string | null;
  classifiedAt: string;
  results: Record<string, PerformanceClassificationResult>;
}

const DEFAULT_MESSAGES: Record<
  PerformanceTrafficStatus,
  Record<'higher' | 'lower' | 'target', string[]>
> = {
  GREEN: {
    higher: [
      'El resultado se encuentra dentro del nivel más alto de la referencia.',
      'La medición refleja un rendimiento destacado para este criterio.',
      'El valor alcanzado representa una fortaleza dentro del perfil evaluado.',
    ],
    lower: [
      'El tiempo se encuentra dentro del nivel más alto de la referencia.',
      'La marca refleja un rendimiento destacado para este protocolo.',
      'El resultado representa una fortaleza dentro del perfil de velocidad.',
    ],
    target: [
      'El resultado se encuentra dentro del rango objetivo.',
      'La medición presenta un comportamiento adecuado para este criterio.',
      'El valor alcanzado coincide con el rango de referencia esperado.',
    ],
  },
  YELLOW: {
    higher: [
      'El resultado es adecuado y todavía presenta margen de desarrollo.',
      'La medición se encuentra en un nivel intermedio respecto de la referencia.',
      'El valor es favorable, aunque aún puede evolucionar con trabajo específico.',
    ],
    lower: [
      'La marca es adecuada y todavía presenta margen de mejora.',
      'El tiempo se encuentra en un nivel intermedio respecto de la referencia.',
      'El resultado es competitivo, aunque puede reducirse con trabajo específico.',
    ],
    target: [
      'El resultado está próximo al rango objetivo y conviene seguir su evolución.',
      'La medición es aceptable, con margen para acercarse al rango esperado.',
      'El valor se encuentra en una zona intermedia respecto del objetivo.',
    ],
  },
  RED: {
    higher: [
      'El desarrollo de esta capacidad será un objetivo prioritario.',
      'La medición se encuentra por debajo de la referencia y requiere trabajo específico.',
      'Este indicador presenta una oportunidad clara de mejora.',
    ],
    lower: [
      'La mejora de esta marca será un objetivo prioritario.',
      'El tiempo se encuentra por encima de la referencia y requiere trabajo específico.',
      'Este resultado presenta una oportunidad clara para desarrollar la velocidad.',
    ],
    target: [
      'El resultado está fuera del rango objetivo y requiere seguimiento.',
      'La medición se aleja de la referencia esperada y conviene abordarla específicamente.',
      'Este indicador representa una oportunidad prioritaria de mejora.',
    ],
  },
};

@Injectable()
export class PerformanceClassificationService {
  classifyMetric(
    value: number,
    threshold: CriteriaThreshold,
  ): PerformanceTrafficStatus | null {
    if (!Number.isFinite(value)) return null;
    const comparable = threshold.useAbs ? Math.abs(value) : value;
    const direction = this.resolveDirection(threshold);

    if (direction === 'TARGET_RANGE') {
      if (
        threshold.greenMin != null &&
        threshold.greenMax != null &&
        comparable >= threshold.greenMin &&
        comparable <= threshold.greenMax
      ) {
        return 'GREEN';
      }
      if (
        threshold.yellowMin != null &&
        threshold.yellowMax != null &&
        comparable >= threshold.yellowMin &&
        comparable <= threshold.yellowMax
      ) {
        return 'YELLOW';
      }
      return this.hasAnyBoundary(threshold) ? 'RED' : null;
    }

    if (direction === 'LOWER_IS_BETTER') {
      if (threshold.greenMax != null && comparable <= threshold.greenMax) return 'GREEN';
      if (threshold.yellowMax != null && comparable <= threshold.yellowMax) return 'YELLOW';
      return threshold.greenMax != null || threshold.yellowMax != null ? 'RED' : null;
    }

    if (threshold.greenMin != null && comparable >= threshold.greenMin) return 'GREEN';
    if (threshold.yellowMin != null && comparable >= threshold.yellowMin) return 'YELLOW';
    return threshold.greenMin != null || threshold.yellowMin != null ? 'RED' : null;
  }

  buildSnapshot(input: {
    criteriaSet: EvaluationCriteriaSet;
    metrics: Record<string, unknown>;
    seed: string;
    protocolCode?: string | null;
  }): PerformanceClassificationSnapshot {
    const results: Record<string, PerformanceClassificationResult> = {};

    for (const [metricKey, threshold] of Object.entries(input.criteriaSet.thresholds ?? {})) {
      const raw = input.metrics[metricKey];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const status = this.classifyMetric(raw, threshold);
      if (!status) continue;

      results[metricKey] = {
        metricKey,
        value: raw,
        status,
        message: this.pickMessage(
          threshold,
          status,
          `${input.seed}:${metricKey}:${status}`,
        ),
        ...(threshold.unit ? { unit: threshold.unit } : {}),
        threshold: { ...threshold },
      };
    }

    return {
      classifierVersion: '1.0',
      referenceSetId: input.criteriaSet.id,
      referenceCode: input.criteriaSet.code,
      referenceName: input.criteriaSet.name,
      referenceVersion: input.criteriaSet.version,
      protocolCode: input.protocolCode ?? input.criteriaSet.protocolCode ?? null,
      classifiedAt: new Date().toISOString(),
      results,
    };
  }

  private resolveDirection(
    threshold: CriteriaThreshold,
  ): 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_RANGE' {
    if (threshold.direction) return threshold.direction;
    return threshold.higherIsBetter === false ? 'LOWER_IS_BETTER' : 'HIGHER_IS_BETTER';
  }

  private hasAnyBoundary(threshold: CriteriaThreshold): boolean {
    return [
      threshold.greenMin,
      threshold.greenMax,
      threshold.yellowMin,
      threshold.yellowMax,
    ].some((value) => value != null);
  }

  private pickMessage(
    threshold: CriteriaThreshold,
    status: PerformanceTrafficStatus,
    seed: string,
  ): string {
    const configured = threshold.messages?.[status.toLowerCase() as 'green' | 'yellow' | 'red'];
    const candidates = Array.isArray(configured)
      ? configured.filter((message) => message.trim().length > 0)
      : configured?.trim()
        ? [configured]
        : [];
    const direction = this.resolveDirection(threshold);
    const fallbackDirection =
      direction === 'LOWER_IS_BETTER'
        ? 'lower'
        : direction === 'TARGET_RANGE'
          ? 'target'
          : 'higher';
    const pool = candidates.length ? candidates : DEFAULT_MESSAGES[status][fallbackDirection];
    return pool[this.stableIndex(seed, pool.length)];
  }

  private stableIndex(seed: string, length: number): number {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % length;
  }
}
