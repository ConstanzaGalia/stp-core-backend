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

/**
 * Normaliza labels Ivolution → claves del reporte.
 * "Altura de Salto (cm)" → "altura_de_salto" (sin unidad).
 */
function normKey(k: string): string {
  return String(k ?? '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
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
  // A1 vacío en exports XLSX Ivolution: la 1ª columna es el label de métrica sin título.
  return !n || n === 'caracteristica' || n === 'feature' || n === 'metric' || n === 'metrica';
}

function isReferenceColumnHeader(header: string): boolean {
  const n = normKey(header);
  return n === 'referencia' || n === 'reference';
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
   * Preview tabulado enviado por el cliente (ya parseado desde XLSX/CSV).
   * headers[0] = label de métrica; resto = repeticiones (Rep 1…).
   */
  extractFromPreviewTable(
    testType: string,
    headers: string[],
    rows: Array<Array<string | null>>,
  ): CsvExtractResult {
    if (!headers?.length || !rows?.length) {
      return { metrics: { parseNote: 'preview_vacio' }, repetitions: [] };
    }

    const featureHeader = String(headers[0] ?? 'Característica').trim() || 'Característica';
    const repetitionHeaders = headers
      .slice(1)
      .map((h, i) => String(h ?? '').trim() || `Rep ${i + 1}`)
      .filter((h) => {
        const n = normKey(h);
        return n && n !== 'referencia' && n !== 'reference';
      });

    if (!repetitionHeaders.length) {
      return { metrics: { parseNote: 'preview_sin_reps' }, repetitions: [] };
    }

    const records: Record<string, string>[] = rows.map((row) => {
      const record: Record<string, string> = {
        [featureHeader]: String(row[0] ?? '').trim(),
      };
      repetitionHeaders.forEach((repHeader, index) => {
        // +1: col 0 es el label; las reps del preview ya excluyen Referencia
        record[repHeader] = String(row[index + 1] ?? '').trim();
      });
      return record;
    });

    return this.extractVerticalMetricsFormat(testType, records, featureHeader, repetitionHeaders);
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

    const countFilled = (header: string) =>
      records.filter((row) => String(row[header] ?? '').trim().length > 0).length;

    const referenciaHeader = headerKeys.find((h) => isReferenceColumnHeader(h));
    const caracteristicaHeader = headerKeys.find((h) => {
      const n = normKey(h);
      return n === 'caracteristica' || n === 'feature' || n === 'metric' || n === 'metrica';
    });
    const emptyFeatureHeader = headerKeys.find((h) => isFeatureColumnHeader(h));

    // Preferir la columna que realmente tiene los nombres (Ivolution: Referencia con labels; A vacía renombrada a Característica)
    let featureHeader: string | undefined;
    const candidates = [caracteristicaHeader, referenciaHeader, emptyFeatureHeader].filter(
      (h): h is string => Boolean(h),
    );
    let bestFill = 0;
    for (const h of candidates) {
      const fill = countFilled(h);
      if (fill > bestFill) {
        bestFill = fill;
        featureHeader = h;
      }
    }
    if (!featureHeader) {
      featureHeader = caracteristicaHeader ?? referenciaHeader ?? emptyFeatureHeader;
    }

    const repetitionHeaders = headerKeys.filter(
      (h) =>
        h !== featureHeader &&
        !isReferenceColumnHeader(h) &&
        normKey(h) !== 'caracteristica' &&
        String(h).trim() !== '',
    );

    const looksVertical =
      featureHeader != null &&
      repetitionHeaders.length > 0 &&
      records.some((row) => String(row[featureHeader!] ?? '').trim().length > 0);

    if (looksVertical) {
      return this.extractVerticalMetricsFormat(testType, records, featureHeader!, repetitionHeaders);
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

    collapseEmptyUnilateralPlates(metrics);

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

const UNILATERAL_PLATE_FAMILIES = [
  'fuerza_pico',
  'fuerza_media',
  'tiempo_de_fuerza_pico',
  'rfd_en_50ms',
  'rfd_en_100ms',
  'rfd_en_150ms',
  'rfd_en_250ms',
  'fuerza_en_50ms',
  'fuerza_en_100ms',
  'fuerza_en_150ms',
  'fuerza_en_250ms',
];

/**
 * McCall a una pierna: Ivolution deja la otra placa en 0.
 * Copia el máximo ≠ 0 a la clave genérica (fuerza_pico, rfd_en_100ms, …).
 */
function collapseEmptyUnilateralPlates(metrics: Record<string, unknown>): void {
  for (const base of UNILATERAL_PLATE_FAMILIES) {
    const positives: number[] = [];
    for (const [key, raw] of Object.entries(metrics)) {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0.5) continue;
      const nk = key.toLowerCase().replace(/_values$/, '');
      if (nk === base || nk.startsWith(`${base}_`)) positives.push(raw);
    }
    if (!positives.length) continue;
    const current = metrics[base];
    if (typeof current !== 'number' || current <= 0.5) {
      metrics[base] = Math.max(...positives);
    }
  }
}
