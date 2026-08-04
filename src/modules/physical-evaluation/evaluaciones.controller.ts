import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { PhysicalEvaluationService } from './physical-evaluation.service';
import { EvaluacionesFilesService } from './evaluaciones-files.service';
import { AiAnalysisService } from './ai-analysis.service';
import { CreateEvaluacionDto } from './dto/create-evaluacion.dto';
import { GenerateAiAnalysisDto } from './dto/generate-ai-analysis.dto';
import { PhotocellImportDto } from './dto/photocell-import.dto';
import { PhotocellImportService } from './photocell-import.service';
import { CreateManualStrengthEvaluationDto } from './dto/create-manual-strength-evaluation.dto';
import { StrengthManualService } from './strength-manual/strength-manual.service';
import { EvaluationBulkService } from './evaluation-bulk.service';
import {
  BulkDuplicateCheckDto,
  PhotocellBatchConfirmDto,
  PhotocellBatchPreviewDto,
} from './dto/photocell-batch-import.dto';
import {
  DEFAULT_EVALUATIONS_MAX_FILE_MB,
  EVALUATIONS_MAX_FILES_PER_REQUEST,
  isAllowedEvaluationFilename,
} from './evaluations-upload.constants';

const uploadLimitsMb = Number(process.env.EVALUATIONS_MAX_FILE_MB || String(DEFAULT_EVALUATIONS_MAX_FILE_MB));
const uploadMaxBytes =
  (Number.isFinite(uploadLimitsMb) && uploadLimitsMb > 0 ? uploadLimitsMb : DEFAULT_EVALUATIONS_MAX_FILE_MB) *
  1024 *
  1024;

function parseFileMetadataList(...candidates: (string | undefined)[]): unknown[] {
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    try {
      const parsed = JSON.parse(c) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* siguiente candidato */
    }
  }
  return [];
}

@Controller('evaluaciones')
@UseGuards(AuthGuard('jwt'))
export class EvaluacionesController {
  constructor(
    private readonly physicalEvaluations: PhysicalEvaluationService,
    private readonly evaluacionesFiles: EvaluacionesFilesService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly photocellImport: PhotocellImportService,
    private readonly strengthManual: StrengthManualService,
    private readonly evaluationBulk: EvaluationBulkService,
  ) {}

  @Post()
  create(@GetUser() actor: User, @Body() dto: CreateEvaluacionDto) {
    return this.physicalEvaluations.createEmptyEvaluation(
      actor,
      dto.athleteId,
      dto.evaluationDate,
      dto.criteriaSetId,
    );
  }

  @Get('company/:companyId/bulk/roster')
  bulkRoster(
    @GetUser() actor: User,
    @Param('companyId') companyId: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.evaluationBulk.getBulkRoster(actor, companyId, divisionId);
  }

  @Post('company/:companyId/bulk/duplicates')
  bulkDuplicates(
    @GetUser() actor: User,
    @Param('companyId') companyId: string,
    @Body() dto: BulkDuplicateCheckDto,
  ) {
    return this.evaluationBulk.checkDuplicates(actor, companyId, dto);
  }

  @Post('company/:companyId/bulk/photocell/preview')
  bulkPhotocellPreview(
    @GetUser() actor: User,
    @Param('companyId') companyId: string,
    @Body() dto: PhotocellBatchPreviewDto,
  ) {
    return this.evaluationBulk.previewPhotocellBatch(actor, companyId, dto);
  }

  @Post('company/:companyId/bulk/photocell/confirm')
  bulkPhotocellConfirm(
    @GetUser() actor: User,
    @Param('companyId') companyId: string,
    @Body() dto: PhotocellBatchConfirmDto,
  ) {
    return this.evaluationBulk.confirmPhotocellBatch(actor, companyId, dto);
  }

  @Post('photocell/preview')
  previewPhotocell(@Body() dto: PhotocellImportDto) {
    return this.photocellImport.buildPreview(dto);
  }

  @Post('photocell')
  async createPhotocell(@GetUser() actor: User, @Body() dto: PhotocellImportDto) {
    const preview = await this.photocellImport.buildPreview(dto);
    return this.physicalEvaluations.createPhotocellEvaluations(
      actor,
      preview,
      dto.criteriaSetId,
    );
  }

  @Post('manual-strength/preview')
  previewManualStrength(@GetUser() actor: User, @Body() dto: CreateManualStrengthEvaluationDto) {
    return this.strengthManual.buildPreview(actor, dto);
  }

  @Post('manual-strength')
  createManualStrength(@GetUser() actor: User, @Body() dto: CreateManualStrengthEvaluationDto) {
    return this.strengthManual.create(actor, dto);
  }

  @Post(':id/ai-analysis')
  generateAiAnalysis(
    @GetUser() actor: User,
    @Param('id') evaluationId: string,
    @Body() dto: GenerateAiAnalysisDto,
  ) {
    return this.aiAnalysis.generateForEvaluation(actor, evaluationId, dto);
  }

  @Post(':id/upload')
  @UseInterceptors(
    FilesInterceptor('files', EVALUATIONS_MAX_FILES_PER_REQUEST, {
      storage: memoryStorage(),
      limits: { fileSize: uploadMaxBytes },
      fileFilter: (_req, file, cb) => {
        if (!isAllowedEvaluationFilename(file.originalname || '')) {
          cb(new Error('Solo se permiten archivos PDF, CSV o Excel (XLS/XLSX)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @GetUser() actor: User,
    @Param('id') evaluationId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('fileMetadata') fileMetadata?: string,
    @Body('metadata') metadata?: string,
    @Body('filesMetadata') filesMetadata?: string,
    @Body('file_metadata') file_metadata?: string,
  ) {
    const metaList = parseFileMetadataList(fileMetadata, metadata, filesMetadata, file_metadata);
    return this.evaluacionesFiles.persistFilesAndAppendTests(actor, evaluationId, files ?? [], metaList);
  }
}
