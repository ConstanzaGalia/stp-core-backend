import { Injectable } from '@nestjs/common';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

/**
 * Infiere `test_type` desde nombre de archivo y/o texto (CSV/PDF) sin intervención del usuario.
 */
@Injectable()
export class TestTypeFromFileService {
  inferFromFilename(filename: string): string | null {
    const n = normalize(filename.replace(/\.[^.]+$/, ''));
    if (n.includes('mccall') || n.includes('mc call') || n.includes('imtp')) {
      if (/\bizq\b|izquierda|\bleft\b|_l\b|mccallizq|mccall_izq|mccallleft/.test(n)) return 'mccall_left';
      if (/\bder\b|derecha|\bright\b|_r\b|mccallder|mccall_der|mccallright/.test(n)) return 'mccall_right';
      return 'mccall';
    }
    if (
      n.includes('squat jump') ||
      n.includes('squatjump') ||
      /\bsqj\b/.test(n) ||
      (n.includes('sq') && n.includes('jump')) ||
      (n.includes('squat') && n.includes('jump'))
    ) {
      return 'squat_jump';
    }
    if (/\bcmj\b/.test(n) || n.includes('cmj') || n.includes('countermovement')) return 'cmj';
    if (/\bdj\b/.test(n) || n.includes('drop jump') || n.includes('drop_jump') || (n.includes('drop') && n.includes('jump')))
      return 'drop_jump';
    if (n.includes('salto') && (n.includes('react') || n.includes('reactivo'))) return 'drop_jump';
    return null;
  }

  inferFromFreeText(text: string): string | null {
    const t = normalize(text.slice(0, 15000));
    if (/\bmccall\b/.test(t) || t.includes('mid thigh pull')) return 'mccall';
    if (t.includes('squat jump') || t.includes('squat_jump')) return 'squat_jump';
    if (/\bcmj\b/.test(t) || t.includes('countermovement jump')) return 'cmj';
    if (t.includes('drop jump') || t.includes('drop_jump') || (t.includes('drop') && t.includes('jump') && t.includes('react')))
      return 'drop_jump';
    if (t.includes('rsi') && (t.includes('contact') || t.includes('contacto'))) return 'drop_jump';
    return null;
  }

  inferFromCsvHeaderLine(headerLine: string): string | null {
    return this.inferFromFreeText(headerLine);
  }

  resolve(originalFilename: string, mimeType: string, contentSample: string): { testType: string; hints: string[] } {
    const hints: string[] = [];
    const fromName = this.inferFromFilename(originalFilename);
    if (fromName) hints.push(`filename→${fromName}`);

    let fromContent: string | null = null;
    if (mimeType === 'text/csv' || originalFilename.toLowerCase().endsWith('.csv')) {
      const firstLine = contentSample.split(/\r?\n/)[0] ?? '';
      fromContent = this.inferFromCsvHeaderLine(firstLine);
      if (fromContent) hints.push(`csv_header→${fromContent}`);
    } else {
      fromContent = this.inferFromFreeText(contentSample);
      if (fromContent) hints.push(`text→${fromContent}`);
    }

    const testType = fromName || fromContent || 'unknown';
    return { testType, hints };
  }
}
