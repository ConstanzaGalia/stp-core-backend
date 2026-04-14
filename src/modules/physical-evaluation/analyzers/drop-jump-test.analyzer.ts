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

/** RSI típico ~0.5–2.5 → 0–100 */
function rsiToScore(rsi: number): number {
  const clamped = Math.max(0.3, Math.min(2.8, rsi));
  return Math.round(((clamped - 0.3) / (2.8 - 0.3)) * 100);
}

export class DropJumpTestAnalyzer implements PhysicalTestAnalyzer {
  readonly testTypes = ['drop_jump', 'dropjump', 'dj'];

  analyze(test: PhysicalTestInput): TestAnalysisPart {
    const m = test.metrics;
    const rsi = num(m, 'rsi', 'RSI', 'reactive_strength_index');
    const ct = num(m, 'contact_time_ms', 'contactTimeMs', 'tiempo_contacto_ms');
    const h = num(m, 'jump_height_cm', 'jumpHeightCm', 'height_cm');

    const lines: string[] = [`**${test.testName}** (Drop jump)`];
    if (rsi != null) lines.push(`RSI: ${rsi}.`);
    if (ct != null) lines.push(`Tiempo de contacto: ${ct} ms.`);
    if (h != null) lines.push(`Altura de salida: ${h} cm.`);

    let scoreContribution: number | null = null;
    if (rsi != null) {
      scoreContribution = rsiToScore(rsi);
      lines.push(
        `Interpretación rápida: reactividad ${rsi >= 1.8 ? 'muy buena' : rsi >= 1.2 ? 'aceptable' : 'mejorable'} según RSI de referencia genérica.`,
      );
    } else {
      lines.push('Añade RSI o tiempo de contacto + altura para un score automático de drop jump.');
    }

    return { scoreContribution, lines };
  }
}
