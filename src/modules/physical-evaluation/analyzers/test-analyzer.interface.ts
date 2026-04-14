import type { PhysicalTestInput, TestAnalysisPart } from '../physical-evaluation.types';

export interface PhysicalTestAnalyzer {
  /** Tipos en minúsculas que este analizador cubre. */
  readonly testTypes: string[];

  analyze(test: PhysicalTestInput): TestAnalysisPart;
}
