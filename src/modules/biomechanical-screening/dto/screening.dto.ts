import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const OBSERVATION_CODES = ['adecuado', 'compensado', 'limitado'] as const;
const CAMERA_VIEWS = ['frontal', 'sagital', 'posterior'] as const;
const SIDES = ['left', 'right'] as const;

/** MediaPipe Pose devuelve 33 puntos; dejamos margen por si cambia el modelo. */
const MAX_LANDMARKS = 40;
/** ~15 fps × 60 s de video. */
const MAX_POSE_TRACK_FRAMES = 1000;
const SNAPSHOT_SOURCES = ['camera', 'video'] as const;

export class CreateScreeningSessionDto {
  @IsOptional()
  @IsDateString()
  evaluationDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QuantitativeDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(40)
  leftCm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(40)
  rightCm?: number | null;
}

export class SidePainDto {
  @IsOptional()
  @IsBoolean()
  left?: boolean;

  @IsOptional()
  @IsBoolean()
  right?: boolean;
}

export class LandingAttemptsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  familiarization?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  valid?: number | null;
}

export class SaveScreeningTestDto {
  @IsOptional()
  @IsObject()
  observations?: Record<string, (typeof OBSERVATION_CODES)[number]>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  compensations?: string[];

  @IsOptional()
  @IsString()
  primaryCompensation?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuantitativeDto)
  quantitative?: QuantitativeDto;

  @IsOptional()
  @IsObject()
  sideObservations?: {
    left?: Record<string, (typeof OBSERVATION_CODES)[number]>;
    right?: Record<string, (typeof OBSERVATION_CODES)[number]>;
  };

  @IsOptional()
  @IsObject()
  sideCompensations?: {
    left?: string[];
    right?: string[];
  };

  @IsOptional()
  @ValidateNested()
  @Type(() => SidePainDto)
  sidePain?: SidePainDto;

  @IsOptional()
  @IsBoolean()
  hasPain?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invalidReasons?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LandingAttemptsDto)
  attempts?: LandingAttemptsDto | null;
}

export class PoseLandmarkDto {
  @Type(() => Number)
  @IsNumber()
  x: number;

  @Type(() => Number)
  @IsNumber()
  y: number;

  @Type(() => Number)
  @IsNumber()
  z: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  visibility?: number;
}

export class CreateScreeningSnapshotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  slotCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsIn(CAMERA_VIEWS)
  view: (typeof CAMERA_VIEWS)[number];

  @IsOptional()
  @IsIn(SIDES)
  side?: (typeof SIDES)[number] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  criterionCodes?: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  poseModel?: string | null;

  @IsArray()
  @ArrayMaxSize(MAX_LANDMARKS)
  @ValidateNested({ each: true })
  @Type(() => PoseLandmarkDto)
  landmarks: PoseLandmarkDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LANDMARKS)
  @ValidateNested({ each: true })
  @Type(() => PoseLandmarkDto)
  worldLandmarks?: PoseLandmarkDto[] | null;

  @IsOptional()
  @IsObject()
  angles?: Record<string, number | null> | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @IsIn(SNAPSHOT_SOURCES)
  source?: (typeof SNAPSHOT_SOURCES)[number];

  @IsOptional()
  @IsString()
  videoId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  videoTimeMs?: number | null;
}

export class PoseTrackFrameDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  t: number;

  @IsArray()
  @ArrayMaxSize(MAX_LANDMARKS)
  @ValidateNested({ each: true })
  @Type(() => PoseLandmarkDto)
  landmarks: PoseLandmarkDto[];
}

export class ScreeningKeyFrameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  slotCode: string;

  @IsOptional()
  @IsIn(SIDES)
  side?: (typeof SIDES)[number] | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  t: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  metricCode: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  metricValue?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;
}

export class CreateScreeningVideoDto {
  @IsIn(CAMERA_VIEWS)
  view: (typeof CAMERA_VIEWS)[number];

  @IsOptional()
  @IsIn(SIDES)
  side?: (typeof SIDES)[number] | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  videoUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMs?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(60)
  fpsSampled?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  poseModel?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POSE_TRACK_FRAMES)
  @ValidateNested({ each: true })
  @Type(() => PoseTrackFrameDto)
  poseTrack?: PoseTrackFrameDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ScreeningKeyFrameDto)
  keyFrames?: ScreeningKeyFrameDto[];
}

export class UpdateScreeningVideoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMs?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(60)
  fpsSampled?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  poseModel?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POSE_TRACK_FRAMES)
  @ValidateNested({ each: true })
  @Type(() => PoseTrackFrameDto)
  poseTrack?: PoseTrackFrameDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ScreeningKeyFrameDto)
  keyFrames?: ScreeningKeyFrameDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  videoUrl?: string | null;
}

export class UpdateScreeningSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  criterionCodes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CompleteScreeningSessionDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateScreeningNotesDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['knee_to_wall', 'deep_squat_overhead', 'hip_hinge', 'single_leg_squat', 'landing_bilateral'])
  currentTestCode?: string;
}
