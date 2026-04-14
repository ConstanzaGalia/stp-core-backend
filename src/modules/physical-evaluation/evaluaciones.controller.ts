import {
  Body,
  Controller,
  Param,
  Post,
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
import { CreateEvaluacionDto } from './dto/create-evaluacion.dto';
import {
  DEFAULT_EVALUATIONS_MAX_FILE_MB,
  EVALUATIONS_MAX_FILES_PER_REQUEST,
} from './evaluations-upload.constants';

const uploadLimitsMb = Number(process.env.EVALUATIONS_MAX_FILE_MB || String(DEFAULT_EVALUATIONS_MAX_FILE_MB));
const uploadMaxBytes =
  (Number.isFinite(uploadLimitsMb) && uploadLimitsMb > 0 ? uploadLimitsMb : DEFAULT_EVALUATIONS_MAX_FILE_MB) *
  1024 *
  1024;

@Controller('evaluaciones')
@UseGuards(AuthGuard('jwt'))
export class EvaluacionesController {
  constructor(
    private readonly physicalEvaluations: PhysicalEvaluationService,
    private readonly evaluacionesFiles: EvaluacionesFilesService,
  ) {}

  @Post()
  create(@GetUser() actor: User, @Body() dto: CreateEvaluacionDto) {
    return this.physicalEvaluations.createEmptyEvaluation(actor, dto.athleteId, dto.evaluationDate);
  }

  @Post(':id/upload')
  @UseInterceptors(
    FilesInterceptor('files', EVALUATIONS_MAX_FILES_PER_REQUEST, {
      storage: memoryStorage(),
      limits: { fileSize: uploadMaxBytes },
      fileFilter: (_req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        if (!name.endsWith('.pdf') && !name.endsWith('.csv')) {
          cb(new Error('Solo se permiten archivos PDF o CSV'), false);
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
  ) {
    return this.evaluacionesFiles.persistFilesAndAppendTests(actor, evaluationId, files ?? []);
  }
}
