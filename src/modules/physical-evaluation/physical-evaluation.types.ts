export type PhysicalTestInput = {
  testName: string;
  testType: string;
  metrics: Record<string, unknown>;
};

export type TestAnalysisPart = {
  /** Contribución 0–100 para agregar al resumen global (promedio entre tests). */
  scoreContribution: number | null;
  lines: string[];
};
