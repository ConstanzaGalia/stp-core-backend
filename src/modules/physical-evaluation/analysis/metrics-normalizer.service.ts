import { Injectable } from '@nestjs/common';
import type { PhysicalTestInput } from '../physical-evaluation.types';
import type { NormalizedTest } from './analysis.types';

const IGNORED_KEYS = new Set([
  '_file',
  '_detection',
  'rawTextSample',
  'rawSample',
  'parseNote',
  'header_join',
  'csv_row_count',
  'csv_last_row_preview',
]);

function isNumeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function toNumber(v: unknown): number | null {
  if (isNumeric(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

@Injectable()
export class MetricsNormalizerService {
  normalize(tests: PhysicalTestInput[]): NormalizedTest[] {
    const grouped = new Map<string, Record<string, number[]>>();

    for (const test of tests) {
      const type = test.testType.trim().toLowerCase();
      if (!grouped.has(type)) grouped.set(type, {});
      const bucket = grouped.get(type)!;

      for (const [key, raw] of Object.entries(test.metrics ?? {})) {
        if (IGNORED_KEYS.has(key) || key.startsWith('_')) continue;

        if (Array.isArray(raw)) {
          const nums = raw.map(toNumber).filter((n): n is number => n !== null);
          if (nums.length) {
            if (!bucket[key]) bucket[key] = [];
            bucket[key].push(...nums);
          }
          continue;
        }

        const n = toNumber(raw);
        if (n !== null) {
          if (!bucket[key]) bucket[key] = [];
          bucket[key].push(n);
        }
      }
    }

    const result: NormalizedTest[] = [];
    for (const [testType, metrics] of grouped) {
      result.push({ testType, metrics });
    }
    return result;
  }
}
