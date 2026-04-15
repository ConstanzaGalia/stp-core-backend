import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

function pickNumber(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) {
      const n = Number(String(m[1]).replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export interface CsvExtractResult {
  metrics: Record<string, unknown>;
  repetitions: Array<Record<string, unknown>>;
}

function normKey(k: string): string {
  return k
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseLocalizedNumber(raw: string): number | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function isFeatureColumnHeader(header: string): boolean {
  const n = normKey(header);
  return n === 'caracteristica' || n === 'feature' || n === 'metric' || n === 'metrica';
}

/** Ivolution y exports ES suelen usar `;`; el default de csv-parse es `,`. */
function detectCsvDelimiter(csvContent: string): ',' | ';' {
  const stripped = csvContent.replace(/^\uFEFF/, '').trim();
  const firstLine = stripped.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  return firstLine.includes(';') ? ';' : ',';
}

/** Extrae métricas estructuradas según tipo inferido y contenido bruto. */
@Injectable()
export class FileMetricsExtractionService {
  extractFromPdfText(testType: string, text: string): Record<string, unknown> {
    const slice = text.slice(0, 20000);
    const base: Record<string, unknown> = { rawTextSample: slice.slice(0, 4000) };

    if (testType === 'drop_jump') {
      const rsi = pickNumber(slice, [/rsi[:\s]+([\d.,]+)/i, /reactive\s*strength[:\s]+([\d.,]+)/i]);
      const contact = pickNumber(slice, [
        /contacto?\s*(?:time|tiempo)?[:\s]+([\d.,]+)\s*(?:ms|mseg)?/i,
        /contact\s*time[:\s]+([\d.,]+)/i,
      ]);
      const jump = pickNumber(slice, [/altura[:\s]+([\d.,]+)\s*cm/i, /jump\s*height[:\s]+([\d.,]+)/i, /([\d.]+)\s*cm/i]);
      return {
        ...base,
        ...(rsi != null ? { rsi } : {}),
        ...(contact != null ? { contact_time_ms: contact } : {}),
        ...(jump != null ? { jump_height_cm: jump } : {}),
      };
    }

    if (testType === 'cmj') {
      const h = pickNumber(slice, [/altura[:\s]+([\d.,]+)\s*cm/i, /jump[:\s]+([\d.,]+)\s*cm/i, /([\d.]+)\s*cm/i]);
      const ft = pickNumber(slice, [/vuelo[:\s]+([\d.,]+)\s*ms/i, /flight[:\s]+([\d.,]+)\s*ms/i]);
      return {
        ...base,
        ...(h != null ? { jump_height_cm: h } : {}),
        ...(ft != null ? { flight_time_ms: ft } : {}),
      };
    }

    return base;
  }

  /**
   * CSV export vertical: primera columna = nombre de métrica, resto = repeticiones.
   * Fallback: comportamiento legacy (última fila como fila ancha de claves).
   */
  extractFromCsv(testType: string, csvContent: string): CsvExtractResult {
    const trimmed = csvContent.trim();
    if (!trimmed) {
      return { metrics: { parseNote: 'csv_vacío' }, repetitions: [] };
    }

    const delimiter = detectCsvDelimiter(trimmed);

    let records: Record<string, string>[];
    try {
      records = parse(trimmed.replace(/^\uFEFF/, ''), {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        delimiter,
      }) as Record<string, string>[];
    } catch {
      return { metrics: { parseNote: 'csv_parse_error', rawSample: trimmed.slice(0, 2000) }, repetitions: [] };
    }

    if (!records?.length) {
      return { metrics: { parseNote: 'sin_filas' }, repetitions: [] };
    }

    const headerKeys = Object.keys(records[0] || {});
    const featureHeader = headerKeys.find((h) => isFeatureColumnHeader(h));
    const repetitionHeaders = headerKeys.filter((h) => h !== featureHeader);

    if (featureHeader && repetitionHeaders.length > 0) {
      return this.extractVerticalMetricsFormat(testType, records, featureHeader, repetitionHeaders);
    }

    return this.extractLegacyLastRowWideFormat(testType, records);
  }

  private extractVerticalMetricsFormat(
    testType: string,
    records: Record<string, string>[],
    featureHeader: string,
    repetitionHeaders: string[],
  ): CsvExtractResult {
    const metrics: Record<string, unknown> = {};
    const repetitions: Array<Record<string, unknown>> = [];

    for (const row of records) {
      const originalLabel = String(row[featureHeader] ?? '').trim();
      if (!originalLabel) continue;

      const key = normKey(originalLabel);
      if (!key) continue;

      const nums: number[] = [];
      for (const h of repetitionHeaders) {
        const n = parseLocalizedNumber(row[h] ?? '');
        if (n !== null) nums.push(n);
      }

      if (!nums.length) continue;

      const mean = average(nums);
      if (mean !== null) {
        metrics[key] = +mean.toFixed(6);
      }
      if (nums.length > 1) {
        metrics[`${key}_values`] = nums.map((n) => +n.toFixed(6));
      }
    }

    let repIndex = 0;
    for (const repHeader of repetitionHeaders) {
      repIndex += 1;
      const repMetrics: Record<string, unknown> = {};
      for (const row of records) {
        const originalLabel = String(row[featureHeader] ?? '').trim();
        if (!originalLabel) continue;
        const key = normKey(originalLabel);
        if (!key) continue;
        const n = parseLocalizedNumber(row[repHeader] ?? '');
        if (n !== null) repMetrics[key] = +n.toFixed(6);
      }
      if (Object.keys(repMetrics).length) {
        repetitions.push({
          repetitionIndex: repIndex,
          repetitionLabel: repHeader.trim() || `Rep ${repIndex}`,
          metrics: repMetrics,
        });
      }
    }

    metrics.csv_row_count = records.length;
    metrics.csv_format = 'metrics_vertical_v1';

    if (testType === 'unknown') {
      metrics.header_join = headerKeysJoin(records[0] || {});
    }

    return { metrics, repetitions };
  }

  private extractLegacyLastRowWideFormat(testType: string, records: Record<string, string>[]): CsvExtractResult {
    const last = records[records.length - 1]!;
    const metrics: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(last)) {
      const nk = normKey(k);
      if (!nk) continue;
      const num = Number(String(v).replace(',', '.'));
      if (String(v).trim() !== '' && Number.isFinite(num)) metrics[nk] = num;
      else metrics[nk] = v;
    }

    metrics.csv_row_count = records.length;
    metrics.csv_last_row_preview = last;

    if (testType === 'unknown') {
      metrics.header_join = headerKeysJoin(records[0] || {});
    }

    return { metrics, repetitions: [] };
  }
}

function headerKeysJoin(firstRow: Record<string, string>): string {
  return Object.keys(firstRow || {}).join(' ');
}
