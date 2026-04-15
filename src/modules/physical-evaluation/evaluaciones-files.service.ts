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
  if (lower.endsWith('.pdf')) return '.pdf';
  if (mime === 'application/pdf') return '.pdf';
  return '.bin';
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
    const extOk = name.endsWith('.pdf') || name.endsWith('.csv');
    const mimeOk = ALLOWED_EVALUATION_MIMETYPES.has(mime) || mime === 'application/octet-stream';
    if (!extOk && !mimeOk) {
      throw new BadRequestException(`Tipo no permitido: ${file.originalname}`);
    }
    if (!extOk && mimeOk && !name.endsWith('.pdf') && !name.endsWith('.csv')) {
      throw new BadRequestException(`Solo PDF o CSV: ${file.originalname}`);
    }
  }

  private async extractContentSample(file: Express.Multer.File): Promise<{ sample: string; isCsv: boolean }> {
    const mime = (file.mimetype || '').toLowerCase();
    const name = file.originalname?.toLowerCase() || '';
    const isCsv = mime.includes('csv') || name.endsWith('.csv');
    if (isCsv) {
      return { sample: file.buffer.toString('utf8').slice(0, 12000), isCsv: true };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(file.buffer);
      return { sample: (data.text || '').slice(0, 15000), isCsv: false };
    } catch {
      return { sample: '', isCsv: false };
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
      const { sample, isCsv } = await this.extractContentSample(file);
      const { testType: inferredType, hints } = this.testTypeFromFile.resolve(file.originalname, file.mimetype, sample);
      const testType = meta.selectedTestType?.trim() || inferredType;

      const fileId = randomUUID();

      let parsedMetrics: Record<string, unknown> = {};
      let repetitions: Array<Record<string, unknown>> = [];
      if (isCsv) {
        const csvFull = file.buffer.toString('utf8');
        const extracted = this.metricsExtraction.extractFromCsv(testType, csvFull);
        parsedMetrics = extracted.metrics;
        repetitions = extracted.repetitions;
      } else {
        parsedMetrics = this.metricsExtraction.extractFromPdfText(testType, sample);
      }

      const previewPayload =
        meta.previewHeaders?.length && meta.previewRows?.length
          ? { headers: meta.previewHeaders, rows: meta.previewRows }
          : null;

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
