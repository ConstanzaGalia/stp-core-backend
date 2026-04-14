import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { User } from 'src/entities/user.entity';
import { PhysicalEvaluation } from 'src/entities/physical-evaluation.entity';
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
      // pdf-parse@1.1.x: API por Buffer, sin pdfjs-dist/DOMMatrix (la v2 rompe en Node).
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

    for (const file of files) {
      this.assertAllowedFile(file, maxBytes);
      const ext = extFromOriginal(file.originalname, file.mimetype);
      const storedName = `${randomUUID()}${ext}`;
      const absPath = path.join(evalDir, storedName);
      await fs.writeFile(absPath, file.buffer);

      const relativePath = path.posix.join(evaluationId, storedName);
      const { sample, isCsv } = await this.extractContentSample(file);
      const { testType, hints } = this.testTypeFromFile.resolve(file.originalname, file.mimetype, sample);

      let parsedMetrics: Record<string, unknown> = {};
      if (isCsv) {
        parsedMetrics = this.metricsExtraction.extractFromCsv(testType, sample);
      } else {
        parsedMetrics = this.metricsExtraction.extractFromPdfText(testType, sample);
      }

      const metrics: Record<string, unknown> = {
        ...parsedMetrics,
        _file: {
          relativePath,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
        _detection: {
          inferredTestType: testType,
          hints,
        },
      };

      const testName = humanizeFilename(file.originalname);

      await this.physicalEvaluations.appendTestFromUpload(actor, evaluationId, {
        testName,
        testType,
        metrics,
      });
    }

    await this.physicalEvaluations.recomputeEvaluationSummary(evaluationId);
    return this.physicalEvaluations.findOneById(actor, athleteId, evaluationId);
  }
}
