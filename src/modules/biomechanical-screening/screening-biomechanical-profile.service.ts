import { Injectable } from '@nestjs/common';
import { BiomechanicalScreeningTestResult } from 'src/entities/biomechanical-screening-test-result.entity';
import {
  BIOMECHANICAL_PROFILE_AXES_V1,
  BIOMECHANICAL_PROFILE_VERSION,
  type ProfileAxisDef,
  type ProfileAxisSourceDef,
} from './protocol/biomechanical-profile.v1';
import {
  findTestDef,
  type ScreeningClassification,
  type ScreeningProtocolDefinition,
  type ScreeningSide,
} from './protocol/stp-functional-screening.v1';
import type {
  BiomechanicalProfileAxis,
  BiomechanicalProfileReport,
  BiomechanicalProfileSource,
} from './screening.types';
import type { SideQualitativeResult, SideQuantitativeResult } from './screening.types';

const CLASSIFICATION_FROM_NORMALIZED: Array<{ min: number; value: ScreeningClassification }> = [
  { min: 0.75, value: 'adecuado' },
  { min: 0.4, value: 'atencion' },
  { min: 0, value: 'limitado' },
];

function classifyFromNormalized(normalized: number): ScreeningClassification {
  for (const band of CLASSIFICATION_FROM_NORMALIZED) {
    if (normalized >= band.min) return band.value;
  }
  return 'limitado';
}

function sideLabel(side: ScreeningSide): string {
  return side === 'left' ? 'izquierda' : 'derecha';
}

@Injectable()
export class ScreeningBiomechanicalProfileService {
  buildProfile(
    definition: ScreeningProtocolDefinition,
    tests: BiomechanicalScreeningTestResult[],
  ): BiomechanicalProfileReport {
    const saved = tests.filter((test) => test.status === 'saved');
    const axes = BIOMECHANICAL_PROFILE_AXES_V1.map((axisDef) =>
      this.buildAxis(definition, saved, axisDef),
    );

    return {
      version: BIOMECHANICAL_PROFILE_VERSION,
      axes,
    };
  }

  private buildAxis(
    definition: ScreeningProtocolDefinition,
    tests: BiomechanicalScreeningTestResult[],
    axisDef: ProfileAxisDef,
  ): BiomechanicalProfileAxis {
    const contributors: BiomechanicalProfileSource[] = [];

    for (const sourceDef of axisDef.sources) {
      const resolved = this.resolveSource(definition, tests, sourceDef);
      if (resolved) contributors.push(resolved);
    }

    if (contributors.length === 0) {
      return {
        code: axisDef.code,
        label: axisDef.label,
        shortLabel: axisDef.shortLabel,
        description: axisDef.description,
        value: null,
        classification: null,
        partial: true,
        sources: [],
      };
    }

    const totalWeight = contributors.reduce((sum, item) => sum + item.weight, 0);
    const weightedSum = contributors.reduce((sum, item) => sum + item.points * item.weight, 0);
    const normalized = totalWeight > 0 ? weightedSum / (totalWeight * 2) : 0;
    const value = Math.round((normalized * 2) * 10) / 10;

    const hasLimitado = contributors.some((item) => item.points === 0);
    const hasAtencion = contributors.some((item) => item.points === 1);
    let classification = classifyFromNormalized(normalized);
    if (hasLimitado) classification = 'limitado';
    else if (hasAtencion && classification === 'adecuado') classification = 'atencion';

    const expectedWeight = axisDef.sources.reduce((sum, item) => sum + item.weight, 0);
    const partial = totalWeight < expectedWeight * 0.5;

    return {
      code: axisDef.code,
      label: axisDef.label,
      shortLabel: axisDef.shortLabel,
      description: axisDef.description,
      value,
      classification,
      partial,
      sources: contributors,
    };
  }

  private resolveSource(
    definition: ScreeningProtocolDefinition,
    tests: BiomechanicalScreeningTestResult[],
    sourceDef: ProfileAxisSourceDef,
  ): BiomechanicalProfileSource | null {
    const test = tests.find((item) => item.testCode === sourceDef.testCode);
    const testDef = findTestDef(definition, sourceDef.testCode);
    if (!test || !testDef || test.status !== 'saved') return null;

    if (sourceDef.kind === 'quantitative_worst_side') {
      const left = test.sideResults?.left as SideQuantitativeResult | undefined;
      const right = test.sideResults?.right as SideQuantitativeResult | undefined;
      if (!left && !right) return null;

      let chosen: SideQuantitativeResult | undefined;
      let side: ScreeningSide | null = null;
      if (left && right) {
        if (left.points <= right.points) {
          chosen = left;
          side = 'left';
        } else {
          chosen = right;
          side = 'right';
        }
      } else {
        chosen = left ?? right;
        side = left ? 'left' : 'right';
      }

      return {
        testCode: test.testCode,
        testName: testDef.name,
        criterionCode: null,
        criterionLabel: null,
        side,
        label: sourceDef.label,
        points: chosen?.points ?? null,
        weight: sourceDef.weight,
        evidence:
          side != null
            ? `${testDef.name} ${sideLabel(side)} → ${chosen?.mobilityLabel?.toLowerCase() ?? 'sin dato'}`
            : `${testDef.name} → sin dato`,
      };
    }

    if (sourceDef.kind === 'criterion' && sourceDef.criterionCode) {
      const criterionDef = testDef.criteria.find((item) => item.code === sourceDef.criterionCode);
      if (!criterionDef) return null;

      if (testDef.scoringMode === 'criteria_bilateral') {
        const left = test.sideResults?.left as SideQualitativeResult | undefined;
        const right = test.sideResults?.right as SideQualitativeResult | undefined;
        const leftObs = left?.observations[sourceDef.criterionCode];
        const rightObs = right?.observations[sourceDef.criterionCode];

        let points: number | null = null;
        let side: ScreeningSide | null = null;
        let optionLabel = '';

        if (leftObs && rightObs) {
          if (leftObs.points <= rightObs.points) {
            points = leftObs.points;
            side = 'left';
            optionLabel = leftObs.option;
          } else {
            points = rightObs.points;
            side = 'right';
            optionLabel = rightObs.option;
          }
        } else if (leftObs) {
          points = leftObs.points;
          side = 'left';
          optionLabel = leftObs.option;
        } else if (rightObs) {
          points = rightObs.points;
          side = 'right';
          optionLabel = rightObs.option;
        }

        if (points == null) return null;

        return {
          testCode: test.testCode,
          testName: testDef.name,
          criterionCode: sourceDef.criterionCode,
          criterionLabel: criterionDef.label,
          side,
          label: sourceDef.label,
          points,
          weight: sourceDef.weight,
          evidence: `${testDef.name} ${sideLabel(side!)} → ${criterionDef.label.toLowerCase()} ${optionLabel}`,
        };
      }

      const observation = test.observations[sourceDef.criterionCode];
      if (!observation) return null;

      return {
        testCode: test.testCode,
        testName: testDef.name,
        criterionCode: sourceDef.criterionCode,
        criterionLabel: criterionDef.label,
        side: null,
        label: sourceDef.label,
        points: observation.points,
        weight: sourceDef.weight,
        evidence: `${testDef.name} → ${criterionDef.label.toLowerCase()} ${observation.option}`,
      };
    }

    return null;
  }
}
