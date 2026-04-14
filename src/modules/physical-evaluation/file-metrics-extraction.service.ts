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

/** Extrae métricas estructuradas según tipo inferido y contenido bruto. */
@Injectable()
export class FileMetricsExtractionService {
  extractFromPdfText(testType: string, text: string): Record<string, unknown> {
    const slice = text.slice(0, 20000);
    const base: Record<string, unknown> = { rawTextSample: slice.slice(0, 4000) };

    if (testType === 'drop_jump') {
      const rsi = pickNumber(slice, [/rsi[:\s]+([\d.,]+)/i, /reactive\s*strength[:\s]+([\d.,]+)/i]);
      const contact = pickNumber(slice, [/contacto?\s*(?:time|tiempo)?[:\s]+([\d.,]+)\s*(?:ms|mseg)?/i, /contact\s*time[:\s]+([\d.,]+)/i]);
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

  extractFromCsv(testType: string, csvContent: string): Record<string, unknown> {
    const trimmed = csvContent.trim();
    if (!trimmed) return { parseNote: 'csv_vacío' };

    let records: Record<string, string>[];
    try {
      records = parse(trimmed, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      }) as Record<string, string>[];
    } catch {
      return { parseNote: 'csv_parse_error', rawSample: trimmed.slice(0, 2000) };
    }

    if (!records?.length) return { parseNote: 'sin_filas' };

    const last = records[records.length - 1]!;
    const metrics: Record<string, unknown> = {};

    const normKey = (k: string) =>
      k
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

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
      const headerJoin = Object.keys(records[0] || {}).join(' ');
      return { ...metrics, header_join: headerJoin };
    }

    return metrics;
  }
}
