import {
  compareWithPrevious,
  evaluateRepetitions,
  type RepMetricSpec,
} from './evaluation-rep-rules';
import {
  buildEffectiveMetrics,
  evaluateTestRepetitions,
  repTestFamily,
} from './rep-metric-specs';

const rep = (metrics: Record<string, number>, i: number) => ({
  repetitionIndex: i + 1,
  repetitionLabel: `Rep ${i + 1}`,
  metrics,
});

/** Cuatro repeticiones reales de un CMJ bilateral (export Ivolution). */
const CMJ_4_REPS = [0, 1, 2, 3].map((i) =>
  rep(
    {
      altura_de_salto: [23.07, 22.03, 23.48, 23.02][i],
      velocidad_maxima_de_despegue: [2.13, 2.08, 2.15, 2.12][i],
      peso_corporal: [54, 54, 54, 53][i],
      rsimod: [1.47, 1.24, 1.21, 1.07][i],
      asimetria_frenado: [-6.69, -2.09, -10.29, -12.19][i],
      asimetria_propulsiva: [-3.89, -0.59, -2.79, 2.4][i],
      asimetria_aterrizaje: [9.6, 4.3, 35.8, 18.5][i],
    },
    i,
  ),
);

describe('repTestFamily', () => {
  it('reconoce familias y descarta unilaterales', () => {
    expect(repTestFamily('cmj')).toBe('cmj');
    expect(repTestFamily('drop_jump')).toBe('drop_jump');
    expect(repTestFamily('mccall_izq')).toBe('mccall');
    expect(repTestFamily('cmj_unilateral')).toBeNull();
    expect(repTestFamily('sprint_10m')).toBeNull();
  });
});

describe('evaluateTestRepetitions · CMJ', () => {
  const result = evaluateTestRepetitions('cmj', CMJ_4_REPS)!;

  it('promedia las repeticiones válidas y mide la dispersión', () => {
    expect(result.validCount).toBe(4);
    expect(result.metrics.altura_de_salto.used).toBeCloseTo(22.9, 1);
    expect(result.metrics.altura_de_salto.stability).toBe('stable');
    expect(result.metrics.rsi.used).toBeCloseTo(1.25, 2);
    expect(result.metrics.rsi.stability).toBe('variable');
    expect(result.confidence).toBe('high');
    expect(result.preliminary).toBe(false);
  });

  it('clasifica las asimetrías por lado y consistencia', () => {
    expect(result.metrics.asimetria_frenado.asymmetry).toMatchObject({
      kind: 'trend',
      side: 'right',
    });
    expect(result.metrics.asimetria_propulsiva.asymmetry?.kind).toBe('small');
    expect(result.metrics.asimetria_aterrizaje.asymmetry?.kind).toBe(
      'not_interpretable',
    );
  });

  it('no elige una repetición: el valor usado no coincide con la de mayor altura', () => {
    expect(result.metrics.altura_de_salto.used).not.toBe(
      result.metrics.altura_de_salto.max,
    );
  });

  it('descarta por regla objetiva una repetición mal detectada', () => {
    const bad = [
      rep(
        {
          altura_de_salto: 3.9,
          velocidad_maxima_de_despegue: 2.13,
          peso_corporal: 55,
        },
        0,
      ),
      rep(
        {
          altura_de_salto: 26.4,
          velocidad_maxima_de_despegue: 2.28,
          peso_corporal: 55,
        },
        1,
      ),
      rep(
        {
          altura_de_salto: 27.6,
          velocidad_maxima_de_despegue: 2.33,
          peso_corporal: 55,
        },
        2,
      ),
    ];
    const r = evaluateTestRepetitions('cmj', bad)!;
    expect(r.reps[0].status).toBe('excluded_rule');
    expect(r.validCount).toBe(2);
    expect(r.preliminary).toBe(true);
  });

  it('respeta la decisión del entrenador, y la última decisión manda', () => {
    const excluded = evaluateTestRepetitions('cmj', CMJ_4_REPS, [
      {
        index: 2,
        override: 'exclude',
        by: 'u1',
        at: '2026-11-02T10:00:00Z',
        reason: null,
      },
    ])!;
    expect(excluded.reps[2].status).toBe('excluded_coach');
    expect(excluded.validCount).toBe(3);
    const restored = evaluateTestRepetitions('cmj', CMJ_4_REPS, [
      {
        index: 2,
        override: 'exclude',
        by: 'u1',
        at: '2026-11-02T10:00:00Z',
        reason: null,
      },
      {
        index: 2,
        override: null,
        by: 'u1',
        at: '2026-11-02T10:05:00Z',
        reason: null,
      },
    ])!;
    expect(restored.reps[2].status).toBe('valid');
  });

  it('acepta alturas en metros', () => {
    const r = evaluateTestRepetitions('cmj', [
      rep({ altura_de_salto: 0.25 }, 0),
      rep({ altura_de_salto: 0.26 }, 1),
      rep({ altura_de_salto: 0.255 }, 2),
    ])!;
    expect(r.metrics.altura_de_salto.used).toBeCloseTo(25.5, 1);
  });

  it('devuelve null sin repeticiones o para tests sin reglas', () => {
    expect(evaluateTestRepetitions('cmj', [])).toBeNull();
    expect(evaluateTestRepetitions('sprint_10m', CMJ_4_REPS)).toBeNull();
  });
});

describe('evaluateTestRepetitions · McCall', () => {
  const mc = (values: number[]) =>
    values.map((f, i) => rep({ fuerza_max_propulsiva: f }, i));

  it('usa el mejor intento y avisa un pico atípico sin excluirlo', () => {
    const r = evaluateTestRepetitions('mccall_der', mc([2.74, 2.8, 3.35]))!;
    expect(r.metrics.fuerza_isometrica.used).toBe(3.35);
    expect(r.atypical).toHaveLength(1);
    expect(r.atypical[0].index).toBe(2);
    expect(r.reps[2].included).toBe(true);
  });

  it('al excluir el pico, el mejor intento baja', () => {
    const r = evaluateTestRepetitions('mccall_der', mc([2.74, 2.8, 3.35]), [
      {
        index: 2,
        override: 'exclude',
        by: null,
        at: '2026-11-02T10:00:00Z',
        reason: 'pico anómalo',
      },
    ])!;
    expect(r.metrics.fuerza_isometrica.used).toBe(2.8);
    expect(r.preliminary).toBe(true);
  });
});

describe('evaluateRepetitions · casos límite', () => {
  const spec: RepMetricSpec[] = [{ key: 'a', kind: 'state' }];

  it('sin repeticiones válidas es insuficiente', () => {
    const r = evaluateRepetitions([], { specs: spec, primaryKey: 'a' });
    expect(r.confidence).toBe('insufficient');
    expect(r.metrics.a.used).toBeNull();
  });

  it('con una sola repetición válida la confianza es baja', () => {
    const r = evaluateRepetitions([{ index: 0, metrics: { a: 10 } }], {
      specs: spec,
      primaryKey: 'a',
    });
    expect(r.confidence).toBe('low');
  });

  it('la convención de signo es configurable', () => {
    const specs: RepMetricSpec[] = [{ key: 'asy', kind: 'asymmetry' }];
    const reps = [-12, -11, -13].map((v, i) => ({
      index: i,
      metrics: { asy: v },
    }));
    const a = evaluateRepetitions(reps, { specs, primaryKey: 'asy' });
    const b = evaluateRepetitions(reps, {
      specs,
      primaryKey: 'asy',
      signConvention: 'negative_is_left_greater',
    });
    expect(a.metrics.asy.asymmetry?.side).toBe('right');
    expect(b.metrics.asy.asymmetry?.side).toBe('left');
  });
});

describe('compareWithPrevious', () => {
  it('informa cambio solo si supera el margen de error', () => {
    expect(compareWithPrevious(27, 25.1, { mdc: 1.2 }).verdict).toBe(
      'improved',
    );
    expect(compareWithPrevious(25.5, 25.1, { mdc: 1.2 }).verdict).toBe(
      'no_clear_change',
    );
    expect(
      compareWithPrevious(16.3, 9, { mdc: 4, higherIsBetter: false }).verdict,
    ).toBe('worsened');
    expect(compareWithPrevious(null, 9, { mdc: 4 }).verdict).toBe(
      'no_clear_change',
    );
  });
});

describe('buildEffectiveMetrics', () => {
  const metricsOf = (alturas: number[]) => ({
    altura_de_salto: alturas.reduce((a, b) => a + b, 0) / alturas.length,
    altura_de_salto_values: alturas,
  });

  it('sin repeticiones excluidas devuelve las métricas originales', () => {
    const m = metricsOf([23.07, 22.03, 23.48, 23.02]);
    expect(buildEffectiveMetrics('cmj', m, CMJ_4_REPS)).toBe(m);
  });

  it('recalcula el promedio sin las repeticiones excluidas por el entrenador', () => {
    const m = metricsOf([23.07, 22.03, 23.48, 23.02]);
    const eff = buildEffectiveMetrics('cmj', m, CMJ_4_REPS, [
      {
        index: 2,
        override: 'exclude',
        by: null,
        at: '2026-11-02T10:00:00Z',
        reason: null,
      },
    ]);
    expect(eff.altura_de_salto).toBeCloseTo((23.07 + 22.03 + 23.02) / 3, 4);
    expect(eff.altura_de_salto_values).toEqual([23.07, 22.03, 23.02]);
    expect(m.altura_de_salto).toBeCloseTo(22.9, 2);
  });

  it('McCall usa el mejor intento de las repeticiones incluidas', () => {
    const reps = [2.74, 2.8, 3.35].map((f, i) => rep({ fuerza_pico: f }, i));
    const m = { fuerza_pico: 2.963333, fuerza_pico_values: [2.74, 2.8, 3.35] };
    const eff = buildEffectiveMetrics('mccall_der', m, reps, [
      {
        index: 2,
        override: 'exclude',
        by: null,
        at: '2026-11-02T10:00:00Z',
        reason: null,
      },
    ]);
    expect(eff.fuerza_pico).toBe(2.8);
  });

  it('si no queda ninguna repetición válida, no deja el test vacío', () => {
    const m = metricsOf([23, 22, 24]);
    const all = [0, 1, 2].map((index) => ({
      index,
      override: 'exclude' as const,
      by: null,
      at: 'x',
      reason: null,
    }));
    expect(buildEffectiveMetrics('cmj', m, CMJ_4_REPS.slice(0, 3), all)).toBe(
      m,
    );
  });
});
