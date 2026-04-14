import type { PhysicalTestAnalyzer } from './test-analyzer.interface';
import type { PhysicalTestInput, TestAnalysisPart } from '../physical-evaluation.types';

function collectNumericLeaves(obj: unknown, prefix = ''): string[] {
  const lines: string[] = [];
  if (obj === null || obj === undefined) return lines;
  if (typeof obj === 'number' && Number.isFinite(obj)) {
    return [`${prefix || 'valor'}: ${obj}`];
  }
  if (typeof obj === 'boolean') {
    return [`${prefix || 'valor'}: ${obj}`];
  }
  if (typeof obj === 'string' && obj.trim().length > 0) {
    return [`${prefix || 'texto'}: ${obj}`];
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      lines.push(...collectNumericLeaves(v, `${prefix}[${i}]`));
    });
    return lines;
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [k, v] of entries) {
      const p = prefix ? `${prefix}.${k}` : k;
      lines.push(...collectNumericLeaves(v, p));
    }
  }
  return lines;
}

export class DefaultPhysicalTestAnalyzer implements PhysicalTestAnalyzer {
  readonly testTypes: string[] = ['*'];

  analyze(test: PhysicalTestInput): TestAnalysisPart {
    const header = `**${test.testName}** (${test.testType})`;
    const metricsLines = collectNumericLeaves(test.metrics);
    const lines = [
      header,
      metricsLines.length > 0
        ? 'Métricas registradas:\n- ' + metricsLines.join('\n- ')
        : 'Sin métricas numéricas o texto en el objeto JSON.',
    ];
    return { scoreContribution: null, lines };
  }
}
