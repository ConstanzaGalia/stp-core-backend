import { Injectable } from '@nestjs/common';
import { BiomechanicalScreeningTestResult } from 'src/entities/biomechanical-screening-test-result.entity';
import {
  findTestDef,
  getObservationPoints,
  type ObservationOptionCode,
  type ScreeningClassification,
  type ScreeningProtocolDefinition,
  type ScreeningSide,
  type ScreeningTestDef,
} from './protocol/stp-functional-screening.v1';
import { ScreeningBiomechanicalProfileService } from './screening-biomechanical-profile.service';
import type {
  CriterionObservation,
  DomainSummary,
  FullReportCriterionRow,
  FullReportTestSection,
  PainAlert,
  SaveTestPayload,
  ScreeningFinding,
  ScreeningFullReport,
  ScreeningQuantitativeValues,
  ScreeningSummaryReport,
  SideQualitativeResult,
  SideQuantitativeResult,
} from './screening.types';

const CLASSIFICATION_RANK: Record<ScreeningClassification, number> = {
  adecuado: 0,
  atencion: 1,
  limitado: 2,
};

function worst(
  a: ScreeningClassification,
  b: ScreeningClassification,
): ScreeningClassification {
  return CLASSIFICATION_RANK[a] >= CLASSIFICATION_RANK[b] ? a : b;
}

function fromPoints(points: number): ScreeningClassification {
  if (points >= 2) return 'adecuado';
  if (points === 1) return 'atencion';
  return 'limitado';
}

function classifyObservations(
  observations: Record<string, CriterionObservation>,
  compensations: string[] = [],
): ScreeningClassification {
  const values = Object.values(observations);
  let result: ScreeningClassification = 'adecuado';
  for (const observation of values) {
    result = worst(result, fromPoints(observation.points));
  }
  if (compensations.length > 0 && result === 'adecuado') {
    result = 'atencion';
  }
  return result;
}

function optionLabel(
  definition: ScreeningProtocolDefinition,
  code: ObservationOptionCode | null,
): string | null {
  if (!code) return null;
  return definition.observationOptions.find((item) => item.code === code)?.label ?? code;
}

function compensationLabel(test: ScreeningTestDef, code: string): string {
  const fromComp = test.compensations.find((item) => item.code === code);
  if (fromComp) return fromComp.label;
  const fromPrimary = test.primaryCompensationOptions?.find((item) => item.code === code);
  if (fromPrimary) return fromPrimary.label;
  const fromInvalid = test.invalidReasons?.find((item) => item.code === code);
  return fromInvalid?.label ?? code;
}

function criterionLabel(test: ScreeningTestDef, code: string): string {
  return test.criteria.find((item) => item.code === code)?.label ?? code;
}

function sideLabel(side: ScreeningSide): string {
  return side === 'left' ? 'izquierda' : 'derecha';
}

function mobilityLabel(classification: ScreeningClassification): string {
  if (classification === 'adecuado') return 'Buena movilidad';
  if (classification === 'atencion') return 'Atención';
  return 'Movilidad limitada';
}

function domainHeadline(
  classification: ScreeningClassification,
  extra?: string,
): string {
  if (extra) return extra;
  if (classification === 'adecuado') return 'Adecuado';
  if (classification === 'atencion') return 'Atención';
  return 'Limitado';
}

function feminineHeadline(classification: ScreeningClassification): string {
  if (classification === 'adecuado') return 'Adecuada';
  if (classification === 'atencion') return 'Atención';
  return 'Limitada';
}

@Injectable()
export class ScreeningScoringService {
  constructor(private readonly biomechanicalProfile: ScreeningBiomechanicalProfileService) {}

  classifyKneeToWallCm(
    cm: number,
    config: ScreeningProtocolDefinition['config']['kneeToWall'],
  ): { points: number; classification: ScreeningClassification; mobilityLabel: string } {
    let classification: ScreeningClassification = 'limitado';
    let points = 0;
    if (cm >= config.goodMinCm) {
      classification = 'adecuado';
      points = 2;
    } else if (cm >= config.attentionMinCm) {
      classification = 'atencion';
      points = 1;
    }
    return { points, classification, mobilityLabel: mobilityLabel(classification) };
  }

  applySavePayload(
    test: BiomechanicalScreeningTestResult,
    definition: ScreeningProtocolDefinition,
    payload: SaveTestPayload,
  ): BiomechanicalScreeningTestResult {
    const testDef = findTestDef(definition, test.testCode);
    if (!testDef) return test;

    test.notes = payload.notes ?? test.notes ?? null;
    test.videoUrl = payload.videoUrl !== undefined ? payload.videoUrl : test.videoUrl;
    test.compensations = payload.compensations ?? test.compensations ?? [];
    test.primaryCompensation =
      payload.primaryCompensation !== undefined
        ? payload.primaryCompensation
        : test.primaryCompensation;
    test.invalidReasons = payload.invalidReasons ?? test.invalidReasons ?? [];
    test.attempts = payload.attempts !== undefined ? payload.attempts : test.attempts;
    test.hasPain = Boolean(payload.hasPain);
    test.maxScore = testDef.maxScore;
    test.status = 'saved';

    if (testDef.scoringMode === 'quantitative') {
      this.applyKneeToWall(test, definition, payload);
      return test;
    }

    if (testDef.scoringMode === 'criteria_bilateral') {
      this.applyBilateralCriteria(test, testDef, payload);
      return test;
    }

    this.applyCriteria(test, testDef, payload);
    return test;
  }

  buildReports(
    definition: ScreeningProtocolDefinition,
    tests: BiomechanicalScreeningTestResult[],
    evaluationDate: string,
    professorNotes: string | null,
  ): {
    summaryReport: ScreeningSummaryReport;
    fullReport: ScreeningFullReport;
    findings: ScreeningFinding[];
    painAlerts: PainAlert[];
  } {
    const sorted = [...tests].sort((a, b) => a.sortOrder - b.sortOrder);
    const findings: ScreeningFinding[] = [];
    const painAlerts: PainAlert[] = [];

    for (const test of sorted) {
      const testDef = findTestDef(definition, test.testCode);
      if (!testDef || test.status !== 'saved') continue;
      findings.push(...this.findingsForTest(definition, testDef, test));
      painAlerts.push(...this.painAlertsForTest(testDef, test));
    }

    const domains = this.buildDomains(definition, sorted);
    const asymmetries = this.buildAsymmetries(definition, sorted);
    const complete = sorted.every((test) => test.status === 'saved');
    const narrative = this.buildNarrative(domains, asymmetries, painAlerts, findings);
    const biomechanicalProfile = this.biomechanicalProfile.buildProfile(definition, sorted);

    const summaryReport: ScreeningSummaryReport = {
      version: 1,
      protocolCode: definition.code,
      protocolVersion: definition.version,
      generatedAt: new Date().toISOString(),
      complete,
      painAlerts,
      domains,
      asymmetries,
      narrative,
      biomechanicalProfile,
    };

    const fullReport: ScreeningFullReport = {
      version: 1,
      protocolCode: definition.code,
      protocolVersion: definition.version,
      generatedAt: summaryReport.generatedAt,
      scoringSnapshot: definition.config,
      identification: {
        protocolName: definition.name,
        evaluationDate,
      },
      summary: summaryReport,
      tests: sorted.map((test) => this.toFullSection(definition, test)),
      painAlerts,
      findings,
      professorNotes,
    };

    return { summaryReport, fullReport, findings, painAlerts };
  }

  private applyKneeToWall(
    test: BiomechanicalScreeningTestResult,
    definition: ScreeningProtocolDefinition,
    payload: SaveTestPayload,
  ) {
    const config = definition.config.kneeToWall;
    const leftCm = payload.quantitative?.leftCm ?? test.quantitative?.leftCm ?? null;
    const rightCm = payload.quantitative?.rightCm ?? test.quantitative?.rightCm ?? null;
    const differenceCm =
      leftCm != null && rightCm != null ? Math.abs(leftCm - rightCm) : null;

    const quantitative: ScreeningQuantitativeValues = { leftCm, rightCm, differenceCm };
    test.quantitative = quantitative;
    test.observations = {};
    test.hasPain = Boolean(payload.sidePain?.left || payload.sidePain?.right || payload.hasPain);

    const sideResults: {
      left?: SideQuantitativeResult;
      right?: SideQuantitativeResult;
    } = {};

    let score = 0;
    let classification: ScreeningClassification = 'adecuado';

    if (leftCm != null) {
      const scored = this.classifyKneeToWallCm(leftCm, config);
      sideResults.left = {
        cm: leftCm,
        points: scored.points,
        classification: scored.classification,
        mobilityLabel: scored.mobilityLabel,
        hasPain: Boolean(payload.sidePain?.left),
      };
      score += scored.points;
      classification = worst(classification, scored.classification);
    }
    if (rightCm != null) {
      const scored = this.classifyKneeToWallCm(rightCm, config);
      sideResults.right = {
        cm: rightCm,
        points: scored.points,
        classification: scored.classification,
        mobilityLabel: scored.mobilityLabel,
        hasPain: Boolean(payload.sidePain?.right),
      };
      score += scored.points;
      classification = worst(classification, scored.classification);
    }
    if (
      differenceCm != null &&
      differenceCm >= config.asymmetryThresholdCm &&
      classification === 'adecuado'
    ) {
      classification = 'atencion';
    }

    test.sideResults = sideResults;
    test.score = leftCm != null && rightCm != null ? score : null;
    test.classification = leftCm != null && rightCm != null ? classification : null;
  }

  private applyCriteria(
    test: BiomechanicalScreeningTestResult,
    testDef: ScreeningTestDef,
    payload: SaveTestPayload,
  ) {
    const observations: Record<string, CriterionObservation> = {};
    const incoming = payload.observations ?? {};
    let score = 0;
    for (const criterion of testDef.criteria) {
      const option = incoming[criterion.code];
      if (!option) continue;
      const points = getObservationPoints(option);
      observations[criterion.code] = { option, points };
      score += points;
    }

    test.observations = observations;
    test.sideResults = null;
    test.quantitative = null;
    test.score = Object.keys(observations).length === testDef.criteria.length ? score : null;
    test.classification =
      Object.keys(observations).length === testDef.criteria.length
        ? classifyObservations(observations, test.compensations)
        : null;
    test.hasPain = Boolean(payload.hasPain) || test.invalidReasons.includes('pain');
  }

  private applyBilateralCriteria(
    test: BiomechanicalScreeningTestResult,
    testDef: ScreeningTestDef,
    payload: SaveTestPayload,
  ) {
    const left = this.scoreSide(
      testDef,
      payload.sideObservations?.left ?? {},
      payload.sideCompensations?.left ?? [],
      Boolean(payload.sidePain?.left),
    );
    const right = this.scoreSide(
      testDef,
      payload.sideObservations?.right ?? {},
      payload.sideCompensations?.right ?? [],
      Boolean(payload.sidePain?.right),
    );

    test.observations = {};
    test.sideResults = { left, right };
    test.quantitative = null;
    test.hasPain = left.hasPain || right.hasPain || Boolean(payload.hasPain);
    const bothComplete =
      Object.keys(left.observations).length === testDef.criteria.length &&
      Object.keys(right.observations).length === testDef.criteria.length;
    test.score = bothComplete ? left.score + right.score : null;
    test.classification = bothComplete ? worst(left.classification, right.classification) : null;
  }

  private scoreSide(
    testDef: ScreeningTestDef,
    incoming: Record<string, ObservationOptionCode>,
    compensations: string[],
    hasPain: boolean,
  ): SideQualitativeResult {
    const observations: Record<string, CriterionObservation> = {};
    let score = 0;
    const findings: string[] = [];
    for (const criterion of testDef.criteria) {
      const option = incoming[criterion.code];
      if (!option) continue;
      const points = getObservationPoints(option);
      observations[criterion.code] = { option, points };
      score += points;
      if (option !== 'adecuado') {
        findings.push(`${criterion.label}: ${option === 'compensado' ? 'compensado' : 'limitado'}`);
      }
    }
    const maxScore = testDef.criteria.length * 2;
    return {
      observations,
      compensations,
      score,
      maxScore,
      classification: classifyObservations(observations, compensations),
      hasPain,
      findings,
    };
  }

  private findingsForTest(
    definition: ScreeningProtocolDefinition,
    testDef: ScreeningTestDef,
    test: BiomechanicalScreeningTestResult,
  ): ScreeningFinding[] {
    const findings: ScreeningFinding[] = [];
    const push = (
      evidence: string,
      severity: ScreeningFinding['severity'],
      extra?: { side?: ScreeningSide | null; criterionCode?: string | null },
    ) => {
      findings.push({
        testCode: testDef.code,
        testName: testDef.name,
        side: extra?.side ?? null,
        criterionCode: extra?.criterionCode ?? null,
        evidence,
        severity,
      });
    };

    if (testDef.scoringMode === 'quantitative' && test.quantitative) {
      const { leftCm, rightCm, differenceCm } = test.quantitative;
      const config = definition.config.kneeToWall;
      const left = test.sideResults?.left as SideQuantitativeResult | undefined;
      const right = test.sideResults?.right as SideQuantitativeResult | undefined;
      if (left && left.classification !== 'adecuado') {
        push(
          `${testDef.name} izquierda → ${left.mobilityLabel.toLowerCase()} (${leftCm} cm)`,
          left.classification === 'limitado' ? 'atencion' : 'info',
          { side: 'left' },
        );
      }
      if (right && right.classification !== 'adecuado') {
        push(
          `${testDef.name} derecha → ${right.mobilityLabel.toLowerCase()} (${rightCm} cm)`,
          right.classification === 'limitado' ? 'atencion' : 'info',
          { side: 'right' },
        );
      }
      if (differenceCm != null && differenceCm >= config.asymmetryThresholdCm) {
        push(
          `${testDef.name} → diferencia de ${differenceCm.toFixed(1)} cm`,
          'atencion',
        );
      }
      return findings;
    }

    if (testDef.scoringMode === 'criteria_bilateral') {
      const left = test.sideResults?.left as SideQualitativeResult | undefined;
      const right = test.sideResults?.right as SideQualitativeResult | undefined;
      if (left && right && left.classification !== right.classification) {
        const weaker = CLASSIFICATION_RANK[left.classification] > CLASSIFICATION_RANK[right.classification]
          ? 'izquierdo'
          : 'derecho';
        push(`${testDef.name} → menor control ${weaker}`, 'atencion');
      } else if (left && right && left.score !== right.score) {
        const weaker = left.score < right.score ? 'izquierdo' : 'derecho';
        push(`${testDef.name} → menor control ${weaker}`, 'info');
      }
      this.pushCriterionFindings(testDef, left?.observations ?? {}, findings, 'left');
      this.pushCriterionFindings(testDef, right?.observations ?? {}, findings, 'right');
      return findings;
    }

    this.pushCriterionFindings(testDef, test.observations, findings);
    for (const compensation of test.compensations) {
      push(`${testDef.name} → compensación de ${compensationLabel(testDef, compensation).toLowerCase()}`, 'info');
    }
    if (test.primaryCompensation) {
      push(
        `${testDef.name} → compensación principal: ${compensationLabel(testDef, test.primaryCompensation).toLowerCase()}`,
        'info',
      );
    }
    if (test.invalidReasons.length > 0) {
      push(
        `${testDef.name} → intento no válido (${test.invalidReasons
          .map((code) => compensationLabel(testDef, code))
          .join(', ')})`,
        'atencion',
      );
    }
    return findings;
  }

  private pushCriterionFindings(
    testDef: ScreeningTestDef,
    observations: Record<string, CriterionObservation>,
    findings: ScreeningFinding[],
    side?: ScreeningSide,
  ) {
    for (const [code, observation] of Object.entries(observations)) {
      if (observation.option === 'adecuado') continue;
      const sideText = side ? ` ${sideLabel(side)}` : '';
      const label = criterionLabel(testDef, code).toLowerCase();
      findings.push({
        testCode: testDef.code,
        testName: testDef.name,
        side: side ?? null,
        criterionCode: code,
        evidence:
          observation.option === 'compensado'
            ? `${testDef.name}${sideText} → compensación de ${label}`
            : `${testDef.name}${sideText} → ${label} limitado`,
        severity: observation.option === 'limitado' ? 'atencion' : 'info',
      });
    }
  }

  private painAlertsForTest(testDef: ScreeningTestDef, test: BiomechanicalScreeningTestResult): PainAlert[] {
    const alerts: PainAlert[] = [];
    const push = (side: ScreeningSide | null) => {
      alerts.push({
        testCode: testDef.code,
        testName: testDef.name,
        side,
        note: side
          ? `Dolor durante ${testDef.name} (${sideLabel(side)}).`
          : `Dolor durante ${testDef.name}.`,
      });
    };
    if (test.sideResults?.left && 'hasPain' in test.sideResults.left && test.sideResults.left.hasPain) {
      push('left');
    }
    if (test.sideResults?.right && 'hasPain' in test.sideResults.right && test.sideResults.right.hasPain) {
      push('right');
    }
    if (test.hasPain && alerts.length === 0) {
      push(null);
    }
    if (test.invalidReasons.includes('pain') && !alerts.some((item) => item.testCode === testDef.code)) {
      push(null);
    }
    return alerts;
  }

  private buildDomains(
    definition: ScreeningProtocolDefinition,
    tests: BiomechanicalScreeningTestResult[],
  ): DomainSummary[] {
    return definition.tests.map((testDef) => {
      const test = tests.find((item) => item.testCode === testDef.code);
      const classification = test?.classification ?? 'atencion';
      const headlineBase =
        testDef.domain === 'MOVILIDAD' || testDef.domain === 'BISAGRA'
          ? feminineHeadline(classification)
          : domainHeadline(classification);

      if (testDef.scoringMode === 'criteria_bilateral') {
        const left = test?.sideResults?.left as SideQualitativeResult | undefined;
        const right = test?.sideResults?.right as SideQualitativeResult | undefined;
        return {
          domain: testDef.domain,
          domainLabel: testDef.domainLabel,
          testCode: testDef.code,
          testName: testDef.name,
          classification,
          headline: headlineBase,
          sides: {
            left: {
              classification: left?.classification ?? 'atencion',
              label: 'Izquierda',
              headline: domainHeadline(left?.classification ?? 'atencion'),
            },
            right: {
              classification: right?.classification ?? 'atencion',
              label: 'Derecha',
              headline: domainHeadline(right?.classification ?? 'atencion'),
            },
          },
        };
      }

      let extra: string | undefined;
      if (testDef.scoringMode === 'quantitative') {
        extra = feminineHeadline(classification);
      }

      return {
        domain: testDef.domain,
        domainLabel: testDef.domainLabel,
        testCode: testDef.code,
        testName: testDef.name,
        classification: test?.status === 'saved' ? classification : 'atencion',
        headline: extra ?? headlineBase,
      };
    });
  }

  private buildAsymmetries(
    definition: ScreeningProtocolDefinition,
    tests: BiomechanicalScreeningTestResult[],
  ): ScreeningSummaryReport['asymmetries'] {
    const list: ScreeningSummaryReport['asymmetries'] = [];
    const ktw = tests.find((test) => test.testCode === 'knee_to_wall');
    const ktwDef = findTestDef(definition, 'knee_to_wall');
    if (ktw?.quantitative?.differenceCm != null && ktwDef) {
      const threshold = definition.config.kneeToWall.asymmetryThresholdCm;
      if (ktw.quantitative.differenceCm >= threshold) {
        list.push({
          testCode: 'knee_to_wall',
          testName: ktwDef.name,
          label: 'Movilidad de tobillo',
          detail: `Diferencia de ${ktw.quantitative.differenceCm.toFixed(1)} cm`,
        });
      }
    }

    const unilateral = tests.find((test) => test.testCode === 'single_leg_squat');
    const unilateralDef = findTestDef(definition, 'single_leg_squat');
    const left = unilateral?.sideResults?.left as SideQualitativeResult | undefined;
    const right = unilateral?.sideResults?.right as SideQualitativeResult | undefined;
    if (unilateralDef && left && right) {
      if (left.classification !== right.classification || left.score !== right.score) {
        const weakerByScore = (left.score ?? 0) <= (right.score ?? 0) ? 'izquierdo' : 'derecho';
        const actuallyWeaker =
          CLASSIFICATION_RANK[left.classification] > CLASSIFICATION_RANK[right.classification]
            ? 'izquierdo'
            : CLASSIFICATION_RANK[right.classification] > CLASSIFICATION_RANK[left.classification]
              ? 'derecho'
              : weakerByScore;
        list.push({
          testCode: 'single_leg_squat',
          testName: unilateralDef.name,
          label: `Control unilateral ${actuallyWeaker}`,
          detail: `Izquierda ${left.score}/${left.maxScore} · Derecha ${right.score}/${right.maxScore}`,
        });
      }
    }
    return list;
  }

  private buildNarrative(
    domains: DomainSummary[],
    asymmetries: ScreeningSummaryReport['asymmetries'],
    painAlerts: PainAlert[],
    findings: ScreeningFinding[],
  ): ScreeningSummaryReport['narrative'] {
    const strengths = domains
      .filter((domain) => domain.classification === 'adecuado' && !domain.sides)
      .map((domain) => `${domain.domainLabel}: ${domain.headline.toLowerCase()}`);

    if (domains.find((d) => d.testCode === 'single_leg_squat')?.sides) {
      const uni = domains.find((d) => d.testCode === 'single_leg_squat');
      if (uni?.sides?.left.classification === 'adecuado') {
        strengths.push('Control unipodal izquierdo adecuado');
      }
      if (uni?.sides?.right.classification === 'adecuado') {
        strengths.push('Control unipodal derecho adecuado');
      }
    }

    const attentions: string[] = [];
    for (const domain of domains) {
      if (domain.sides) {
        if (domain.sides.left.classification !== 'adecuado') {
          attentions.push(`Control unipodal izquierdo: ${domain.sides.left.headline.toLowerCase()}`);
        }
        if (domain.sides.right.classification !== 'adecuado') {
          attentions.push(`Control unipodal derecho: ${domain.sides.right.headline.toLowerCase()}`);
        }
      } else if (domain.classification !== 'adecuado') {
        attentions.push(`${domain.domainLabel}: ${domain.headline.toLowerCase()}`);
      }
    }
    for (const asymmetry of asymmetries) {
      attentions.push(asymmetry.detail);
    }

    const topFindings = findings
      .filter((item) => item.severity !== 'alerta')
      .slice(0, 3)
      .map((item) => item.evidence.replace(/^[^→]+→\s*/, '').trim());

    let reading: string;
    if (topFindings.length === 0 && asymmetries.length === 0) {
      reading = 'No se observaron limitaciones relevantes en los patrones evaluados.';
    } else if (topFindings.length === 1) {
      reading = `Se observa ${topFindings[0]}.`;
    } else if (topFindings.length === 2) {
      reading = `Se observa ${topFindings[0]} y ${topFindings[1]}.`;
    } else {
      reading = `Se observa ${topFindings[0]}, ${topFindings[1]} y ${topFindings[2]}.`;
    }
    reading += painAlerts.length > 0 ? ' Hay alerta de dolor.' : ' Sin dolor.';

    return {
      reading,
      strengths: strengths.length > 0 ? strengths : ['Sin fortalezas destacadas todavía.'],
      attentions: attentions.length > 0 ? attentions : ['Sin atenciones destacadas.'],
    };
  }

  private toFullSection(
    definition: ScreeningProtocolDefinition,
    test: BiomechanicalScreeningTestResult,
  ): FullReportTestSection {
    const testDef = findTestDef(definition, test.testCode);
    const criteria: FullReportCriterionRow[] =
      testDef?.criteria.map((criterion) => {
        const observation = test.observations[criterion.code];
        return {
          code: criterion.code,
          label: criterion.label,
          option: observation?.option ?? null,
          optionLabel: optionLabel(definition, observation?.option ?? null),
          points: observation?.points ?? null,
        };
      }) ?? [];

    const findings: string[] = [];
    if (testDef) {
      findings.push(
        ...this.findingsForTest(definition, testDef, test).map((item) => item.evidence),
      );
    }

    return {
      testCode: test.testCode,
      testName: testDef?.name ?? test.testCode,
      domainLabel: testDef?.domainLabel ?? '',
      status: test.status,
      score: test.score,
      maxScore: test.maxScore ?? testDef?.maxScore ?? 0,
      classification: test.classification,
      hasPain: test.hasPain,
      notes: test.notes,
      videoUrl: test.videoUrl,
      quantitative: test.quantitative,
      criteria,
      compensations: (test.compensations ?? []).map((code) =>
        testDef ? compensationLabel(testDef, code) : code,
      ),
      primaryCompensation: test.primaryCompensation
        ? testDef
          ? compensationLabel(testDef, test.primaryCompensation)
          : test.primaryCompensation
        : null,
      invalidReasons: (test.invalidReasons ?? []).map((code) =>
        testDef ? compensationLabel(testDef, code) : code,
      ),
      sideResults: test.sideResults,
      attempts: test.attempts,
      findings,
    };
  }
}
