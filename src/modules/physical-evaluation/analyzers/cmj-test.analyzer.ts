import type { PhysicalTestAnalyzer } from './test-analyzer.interface';
import type { PhysicalTestInput, TestAnalysisPart } from '../physical-evaluation.types';

function num(m: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Heurística simple: altura de salto (cm) → score 0–100 para el resumen. */
function jumpHeightToScore(cm: number): number {
  const clamped = Math.max(15, Math.min(75, cm));
  return Math.round(((clamped - 15) / (75 - 15)) * 100);
}

export class CmjTestAnalyzer implements PhysicalTestAnalyzer {
  readonly testTypes = ['cmj', 'countermovement_jump'];

  analyze(test: PhysicalTestInput): TestAnalysisPart {
    const m = test.metrics;
    const h = num(m, 'jump_height_cm', 'jumpHeightCm', 'altura_salto_cm', 'height_cm');
    const ft = num(m, 'flight_time_ms', 'flightTimeMs', 'tiempo_vuelo_ms');
    const pp = num(m, 'peak_power_w', 'peakPowerW', 'potencia_pico_w');

    const lines: string[] = [`**${test.testName}** (CMJ)`];
    if (h != null) lines.push(`Altura estimada/medida: ${h} cm.`);
    if (ft != null) lines.push(`Tiempo de vuelo: ${ft} ms.`);
    if (pp != null) lines.push(`Potencia pico: ${pp} W.`);

    let scoreContribution: number | null = null;
    if (h != null) {
      scoreContribution = jumpHeightToScore(h);
      lines.push(
        `Interpretación rápida: capacidad de salto vertical ${h >= 55 ? 'alta' : h >= 40 ? 'media' : 'a desarrollar'} para contexto general.`,
      );
    } else if (ft != null) {
      scoreContribution = Math.round(Math.min(100, Math.max(0, (ft - 350) / 3)));
      lines.push('Se usó tiempo de vuelo como proxy del rendimiento en el resumen numérico.');
    }

    if (scoreContribution == null) {
      lines.push('Faltan métricas clave (p. ej. jump_height_cm) para un score automático de CMJ.');
    }

    return { scoreContribution, lines };
  }
}
