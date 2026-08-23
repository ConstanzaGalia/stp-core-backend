import type {
  ObservationOptionCode,
  ScreeningClassification,
  ScreeningDomainCode,
  ScreeningProtocolDefinition,
  ScreeningSide,
} from './protocol/stp-functional-screening.v1';

export type ScreeningSessionStatus = 'draft' | 'in_progress' | 'completed';
export type ScreeningTestStatus = 'pending' | 'saved';

export interface CriterionObservation {
  option: ObservationOptionCode;
  points: number;
}

export interface SideQualitativeResult {
  observations: Record<string, CriterionObservation>;
  compensations: string[];
  score: number;
  maxScore: number;
  classification: ScreeningClassification;
  hasPain: boolean;
  findings: string[];
}

export interface SideQuantitativeResult {
  cm: number;
  points: number;
  classification: ScreeningClassification;
  mobilityLabel: string;
  hasPain: boolean;
}

export interface ScreeningQuantitativeValues {
  leftCm: number | null;
  rightCm: number | null;
  differenceCm: number | null;
}

export interface LandingAttemptsMeta {
  familiarization?: number | null;
  valid?: number | null;
}

export interface PainAlert {
  testCode: string;
  testName: string;
  side: ScreeningSide | null;
  note: string;
}

export interface ScreeningFinding {
  testCode: string;
  testName: string;
  side: ScreeningSide | null;
  criterionCode: string | null;
  evidence: string;
  severity: 'info' | 'atencion' | 'alerta';
}

export interface DomainSideSummary {
  classification: ScreeningClassification;
  label: string;
  headline: string;
}

export interface DomainSummary {
  domain: ScreeningDomainCode;
  domainLabel: string;
  testCode: string;
  testName: string;
  classification: ScreeningClassification;
  headline: string;
  sides?: {
    left: DomainSideSummary;
    right: DomainSideSummary;
  };
}

export interface AsymmetrySummary {
  testCode: string;
  testName: string;
  label: string;
  detail: string;
}

export interface SummaryNarrative {
  reading: string;
  strengths: string[];
  attentions: string[];
}

export interface BiomechanicalProfileSource {
  testCode: string;
  testName: string;
  criterionCode: string | null;
  criterionLabel: string | null;
  side: ScreeningSide | null;
  label: string;
  points: number | null;
  weight: number;
  evidence: string;
}

export interface BiomechanicalProfileAxis {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  value: number | null;
  classification: ScreeningClassification | null;
  partial: boolean;
  sources: BiomechanicalProfileSource[];
}

export interface BiomechanicalProfileReport {
  version: number;
  axes: BiomechanicalProfileAxis[];
}

export interface ScreeningSummaryReport {
  version: number;
  protocolCode: string;
  protocolVersion: number;
  generatedAt: string;
  complete: boolean;
  painAlerts: PainAlert[];
  domains: DomainSummary[];
  asymmetries: AsymmetrySummary[];
  narrative: SummaryNarrative;
  biomechanicalProfile?: BiomechanicalProfileReport | null;
}

export interface FullReportCriterionRow {
  code: string;
  label: string;
  option: ObservationOptionCode | null;
  optionLabel: string | null;
  points: number | null;
}

export interface FullReportTestSection {
  testCode: string;
  testName: string;
  domainLabel: string;
  status: ScreeningTestStatus;
  score: number | null;
  maxScore: number;
  classification: ScreeningClassification | null;
  hasPain: boolean;
  notes: string | null;
  videoUrl: string | null;
  quantitative: ScreeningQuantitativeValues | null;
  criteria: FullReportCriterionRow[];
  compensations: string[];
  primaryCompensation: string | null;
  invalidReasons: string[];
  sideResults: {
    left?: SideQualitativeResult | SideQuantitativeResult;
    right?: SideQualitativeResult | SideQuantitativeResult;
  } | null;
  attempts: LandingAttemptsMeta | null;
  findings: string[];
}

export interface ScreeningFullReport {
  version: number;
  protocolCode: string;
  protocolVersion: number;
  generatedAt: string;
  scoringSnapshot: ScreeningProtocolDefinition['config'];
  identification: {
    protocolName: string;
    evaluationDate: string;
  };
  summary: ScreeningSummaryReport;
  tests: FullReportTestSection[];
  painAlerts: PainAlert[];
  findings: ScreeningFinding[];
  professorNotes: string | null;
}

export interface SaveTestPayload {
  observations?: Record<string, ObservationOptionCode>;
  compensations?: string[];
  primaryCompensation?: string | null;
  quantitative?: {
    leftCm?: number | null;
    rightCm?: number | null;
  };
  sideObservations?: {
    left?: Record<string, ObservationOptionCode>;
    right?: Record<string, ObservationOptionCode>;
  };
  sideCompensations?: {
    left?: string[];
    right?: string[];
  };
  sidePain?: {
    left?: boolean;
    right?: boolean;
  };
  hasPain?: boolean;
  invalidReasons?: string[];
  videoUrl?: string | null;
  notes?: string | null;
  attempts?: LandingAttemptsMeta | null;
}
