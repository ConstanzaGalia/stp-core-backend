import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { User } from 'src/entities/user.entity';
import type { PhysicalEvaluation, PhysicalEvaluationFileMeta } from 'src/entities/physical-evaluation.entity';
import { PhysicalEvaluationService } from './physical-evaluation.service';
import { TestTypeFromFileService } from './test-type-from-file.service';
import { FileMetricsExtractionService } from './file-metrics-extraction.service';
import {
  ALLOWED_EVALUATION_MIMETYPES,
  DEFAULT_EVALUATIONS_MAX_FILE_MB,
  DEFAULT_EVALUATIONS_UPLOAD_DIR,
  EVALUATIONS_MAX_FILES_PER_REQUEST,
  isAllowedEvaluationFilename,
  isSpreadsheetFilename,
} from './evaluations-upload.constants';

function resolveUploadRoot(): string {
  const raw = process.env.EVALUATIONS_UPLOAD_DIR?.trim();
  if (raw && path.isAbsolute(raw)) return raw;
  return path.join(process.cwd(), raw || DEFAULT_EVALUATIONS_UPLOAD_DIR);
}

function maxFileBytes(): number {
  const mb = Number(process.env.EVALUATIONS_MAX_FILE_MB || String(DEFAULT_EVALUATIONS_MAX_FILE_MB));
  const n = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_EVALUATIONS_MAX_FILE_MB;
  return Math.floor(n * 1024 * 1024);
}

function humanizeFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return base.replace(/[_]+/g, ' ').trim() || 'Test importado';
}

function extFromOriginal(name: string, mime: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return '.csv';
  if (lower.endsWith('.xlsx')) return '.xlsx';
  if (lower.endsWith('.xls')) return '.xls';
  if (lower.endsWith('.pdf')) return '.pdf';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return '.xlsx';
  if (mime === 'application/vnd.ms-excel') return '.xls';
  return '.bin';
}

function sheetToStringMatrix(
  XLSX: typeof import('xlsx'),
  sheet: import('xlsx').WorkSheet,
): string[][] {
  const cellAddrs = Object.keys(sheet).filter((key) => !key.startsWith('!'));
  if (!cellAddrs.length) return [];

  let maxR = 0;
  let maxC = 0;
  for (const addr of cellAddrs) {
    const { r, c } = XLSX.utils.decode_cell(addr);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }

  const matrix: string[][] = [];
  for (let r = 0; r <= maxR; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxC; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as
        | { w?: string; v?: string | number | boolean | Date }
        | undefined;
      let value = '';
      if (cell) {
        if (cell.w != null && String(cell.w).trim() !== '') value = String(cell.w).trim();
        else if (cell.v != null) value = String(cell.v).trim();
      }
      row.push(value);
    }
    matrix.push(row);
  }
  return matrix;
}

function matrixToVerticalCsv(matrix: string[][]): string {
  const rows = matrix.filter((row) => row.some((cell) => cell.length > 0));
  if (rows.length < 2) return '';

  const header = [...rows[0]];
  while (header.length > 0 && header[header.length - 1] === '') header.pop();
  // Export Ivolution XLSX: A1 vacío | Referencia | Rep N
  if (!header[0]) header[0] = 'Característica';

  const maxCols = Math.max(header.length, ...rows.slice(1).map((r) => r.length));
  while (header.length < maxCols) header.push('');

  const escapeCell = (value: string) => {
    if (value.includes(';') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  return [
    header.map(escapeCell).join(';'),
    ...rows.slice(1).map((row) => header.map((_, index) => escapeCell(row[index] ?? '')).join(';')),
  ].join('\n');
}

function spreadsheetBufferToCsv(buffer: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true, cellDates: true });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = matrixToVerticalCsv(sheetToStringMatrix(XLSX, sheet));
    if (csv) return csv;
  }
  return '';
}

/** Campos opcionales enviados por el cliente (FormData `fileMetadata` JSON). */
interface ClientUploadFileMetadata {
  originalFilename?: string;
  detectedTestType?: string;
  selectedTestType?: string;
  parserFormat?: string;
  parserWarnings?: string[];
  parserCompleteness?: number;
  previewHeaders?: string[];
  previewRows?: Array<Array<string | null>>;
  storageKey?: string;
  signedUrl?: string;
  downloadUrl?: string;
  uploadedAt?: string;
  mimeType?: string | null;
  size?: number;
}

function coerceMetadataEntry(raw: unknown): ClientUploadFileMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    originalFilename: typeof o.originalFilename === 'string' ? o.originalFilename : undefined,
    detectedTestType: typeof o.detectedTestType === 'string' ? o.detectedTestType : undefined,
    selectedTestType: typeof o.selectedTestType === 'string' ? o.selectedTestType : undefined,
    parserFormat: typeof o.parserFormat === 'string' ? o.parserFormat : undefined,
    parserWarnings: Array.isArray(o.parserWarnings) ? o.parserWarnings.map((w) => String(w)) : undefined,
    parserCompleteness: typeof o.parserCompleteness === 'number' ? o.parserCompleteness : undefined,
    previewHeaders: Array.isArray(o.previewHeaders) ? o.previewHeaders.map((h) => String(h)) : undefined,
    previewRows: Array.isArray(o.previewRows)
      ? o.previewRows.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? null : String(c))) : []))
      : undefined,
    storageKey: typeof o.storageKey === 'string' ? o.storageKey : undefined,
    signedUrl: typeof o.signedUrl === 'string' ? o.signedUrl : undefined,
    downloadUrl: typeof o.downloadUrl === 'string' ? o.downloadUrl : undefined,
    uploadedAt: typeof o.uploadedAt === 'string' ? o.uploadedAt : undefined,
    mimeType: typeof o.mimeType === 'string' ? o.mimeType : o.mimeType === null ? null : undefined,
    size: typeof o.size === 'number' ? o.size : undefined,
  };
}

@Injectable()
export class EvaluacionesFilesService {
  constructor(
    private readonly physicalEvaluations: PhysicalEvaluationService,
    private readonly testTypeFromFile: TestTypeFromFileService,
    private readonly metricsExtraction: FileMetricsExtractionService,
  ) {}

  private assertAllowedFile(file: Express.Multer.File, maxBytes: number) {
    if (!file?.buffer?.length) throw new BadRequestException('Archivo vacío');
    if (file.size > maxBytes) {
      throw new BadRequestException(`Archivo demasiado grande: ${file.originalname}`);
    }
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    const extOk = isAllowedEvaluationFilename(name);
    const mimeOk = ALLOWED_EVALUATION_MIMETYPES.has(mime) || mime === 'application/octet-stream';
    if (!extOk && !mimeOk) {
      throw new BadRequestException(`Tipo no permitido: ${file.originalname}`);
    }
    if (!extOk && mimeOk) {
      throw new BadRequestException(`Solo PDF, CSV o Excel (XLS/XLSX): ${file.originalname}`);
    }
  }

  private async extractContentSample(file: Express.Multer.File): Promise<{ sample: string; isTabular: boolean }> {
    const mime = (file.mimetype || '').toLowerCase();
    const name = file.originalname?.toLowerCase() || '';
    const isCsv = mime.includes('csv') || name.endsWith('.csv');
    const isSpreadsheet =
      isSpreadsheetFilename(name) ||
      mime.includes('spreadsheet') ||
      mime === 'application/vnd.ms-excel';

    if (isCsv) {
      return { sample: file.buffer.toString('utf8').slice(0, 12000), isTabular: true };
    }
    if (isSpreadsheet) {
      try {
        const csv = spreadsheetBufferToCsv(file.buffer);
        return { sample: csv.slice(0, 12000), isTabular: true };
      } catch {
        return { sample: '', isTabular: true };
      }
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(file.buffer);
      return { sample: (data.text || '').slice(0, 15000), isTabular: false };
    } catch {
      return { sample: '', isTabular: false };
    }
  }

  async persistFilesAndAppendTests(
    actor: User,
    evaluationId: string,
    files: Express.Multer.File[],
    fileMetadataList: unknown[] = [],
  ): Promise<PhysicalEvaluation> {
    if (!files?.length) throw new BadRequestException('Debe enviar al menos un archivo en el campo files');
    if (files.length > EVALUATIONS_MAX_FILES_PER_REQUEST) {
      throw new BadRequestException(`Máximo ${EVALUATIONS_MAX_FILES_PER_REQUEST} archivos por solicitud`);
    }

    const ev = await this.physicalEvaluations.findEvaluationForActor(actor, evaluationId, true);
    const athleteId = ev.user.id;
    const maxBytes = maxFileBytes();
    const root = resolveUploadRoot();
    const evalDir = path.join(root, evaluationId);
    await fs.mkdir(evalDir, { recursive: true });

    const newFileMetas: PhysicalEvaluationFileMeta[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const meta = coerceMetadataEntry(fileMetadataList[i]);

      this.assertAllowedFile(file, maxBytes);
      const ext = extFromOriginal(file.originalname, file.mimetype);
      const storedName = `${randomUUID()}${ext}`;
      const absPath = path.join(evalDir, storedName);
      await fs.writeFile(absPath, file.buffer);

      const relativePath = path.posix.join(evaluationId, storedName);
      const { sample, isTabular } = await this.extractContentSample(file);
      const { testType: inferredType, hints } = this.testTypeFromFile.resolve(file.originalname, file.mimetype, sample);
      const testType = meta.selectedTestType?.trim() || inferredType;

      const fileId = randomUUID();

      const previewPayload =
        meta.previewHeaders?.length && meta.previewRows?.length
          ? { headers: meta.previewHeaders, rows: meta.previewRows }
          : null;

      let parsedMetrics: Record<string, unknown> = {};
      let repetitions: Array<Record<string, unknown>> = [];
      if (isTabular) {
        const csvFull = isSpreadsheetFilename(file.originalname)
          ? spreadsheetBufferToCsv(file.buffer)
          : file.buffer.toString('utf8');
        const extracted = csvFull.trim()
          ? this.metricsExtraction.extractFromCsv(testType, csvFull)
          : { metrics: {} as Record<string, unknown>, repetitions: [] as Array<Record<string, unknown>> };

        // Preferir preview del cliente si el re-parse del archivo rinde pocas métricas numéricas
        // (típico en XLSX Ivolution donde el front ya resolvió el layout).
        const fromPreview =
          previewPayload != null
            ? this.metricsExtraction.extractFromPreviewTable(
                testType,
                previewPayload.headers,
                previewPayload.rows,
              )
            : null;

        const countNumeric = (m: Record<string, unknown>) =>
          Object.entries(m).filter(
            ([k, v]) => !k.startsWith('csv_') && !k.startsWith('parse') && typeof v === 'number',
          ).length;

        const fileCount = countNumeric(extracted.metrics);
        const previewCount = fromPreview ? countNumeric(fromPreview.metrics) : 0;

        if (previewCount > fileCount) {
          // Preview gana en cantidad, pero no descartamos keys del archivo (defensa si preview truncado)
          parsedMetrics = { ...extracted.metrics, ...fromPreview!.metrics };
          repetitions = fromPreview!.repetitions.length ? fromPreview!.repetitions : extracted.repetitions;
        } else {
          parsedMetrics = { ...fromPreview?.metrics, ...extracted.metrics };
          repetitions = extracted.repetitions.length
            ? extracted.repetitions
            : fromPreview?.repetitions ?? [];
        }
      } else {
        parsedMetrics = this.metricsExtraction.extractFromPdfText(testType, sample);
      }

      const fileMetaRow: PhysicalEvaluationFileMeta = {
        id: fileId,
        originalFilename: meta.originalFilename || file.originalname,
        mimeType: meta.mimeType ?? file.mimetype ?? null,
        size: meta.size ?? file.size ?? null,
        uploadedAt: meta.uploadedAt ?? new Date().toISOString(),
        status: 'ready',
        storageKey: meta.storageKey ?? null,
        downloadUrl: meta.downloadUrl ?? meta.signedUrl ?? null,
        signedUrl: meta.signedUrl ?? null,
        localRelativePath: relativePath,
        testType,
        detectedTestType: meta.detectedTestType ?? inferredType ?? null,
        parserFormat: meta.parserFormat ?? null,
        warnings: meta.parserWarnings ?? [],
        errorMessage: null,
        preview:
          previewPayload ??
          (meta.parserCompleteness != null
            ? { parserCompleteness: meta.parserCompleteness }
            : null),
      };

      newFileMetas.push(fileMetaRow);

      const metrics: Record<string, unknown> = {
        ...parsedMetrics,
        _file: {
          id: fileId,
          relativePath,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey: meta.storageKey ?? null,
          signedUrl: meta.signedUrl ?? null,
          downloadUrl: meta.downloadUrl ?? meta.signedUrl ?? null,
          uploadedAt: meta.uploadedAt ?? null,
          preview: previewPayload,
        },
        _detection: {
          inferredTestType: inferredType,
          hints,
        },
      };

      const testName = humanizeFilename(file.originalname);

      await this.physicalEvaluations.appendTestFromUpload(actor, evaluationId, {
        testName,
        testType,
        metrics,
        repetitions,
        sourceFileId: fileId,
      });
    }

    await this.physicalEvaluations.appendEvaluationFiles(evaluationId, newFileMetas);
    await this.physicalEvaluations.recomputeEvaluationSummary(evaluationId);
    return this.physicalEvaluations.findOneById(actor, athleteId, evaluationId);
  }
}
