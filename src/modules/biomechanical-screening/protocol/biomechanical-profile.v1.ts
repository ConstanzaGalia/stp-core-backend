/**
 * Perfil biomecánico compuesto STP v1.
 * Agrega criterios de varios tests en ejes funcionales observables.
 * Escala por fuente: 0 limitado · 1 atención · 2 adecuado.
 */

export const BIOMECHANICAL_PROFILE_VERSION = 1;

export type ProfileSourceKind =
  | 'criterion'
  | 'quantitative_worst_side'
  | 'compensation'
  | 'primary_compensation';

export interface ProfileAxisSourceDef {
  kind: ProfileSourceKind;
  testCode: string;
  criterionCode?: string;
  compensationCode?: string;
  /** En tests bilaterales: peor lado (default) */
  side?: 'worst';
  weight: number;
  label: string;
}

export interface ProfileAxisDef {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  sources: ProfileAxisSourceDef[];
}

export const BIOMECHANICAL_PROFILE_AXES_V1: ProfileAxisDef[] = [
  {
    code: 'tobillo',
    label: 'Tobillo',
    shortLabel: 'Tobillo',
    description: 'Movilidad de dorsiflexión en carga (Knee to Wall).',
    sources: [
      {
        kind: 'quantitative_worst_side',
        testCode: 'knee_to_wall',
        weight: 1,
        label: 'Knee to Wall · peor lado',
      },
    ],
  },
  {
    code: 'cadera',
    label: 'Cadera',
    shortLabel: 'Cadera',
    description: 'Movilidad y control de cadera desde bisagra, sentadilla global y control pélvico unipodal.',
    sources: [
      {
        kind: 'criterion',
        testCode: 'hip_hinge',
        criterionCode: 'hip_motion',
        weight: 0.4,
        label: 'Bisagra · movimiento de cadera',
      },
      {
        kind: 'criterion',
        testCode: 'deep_squat_overhead',
        criterionCode: 'depth',
        weight: 0.35,
        label: 'Deep Squat · profundidad',
      },
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'pelvis',
        side: 'worst',
        weight: 0.25,
        label: 'Unipodal · pelvis (peor lado)',
      },
    ],
  },
  {
    code: 'control_tronco',
    label: 'Control de tronco',
    shortLabel: 'Tronco',
    description: 'Estabilidad y alineación de columna y tronco en patrones globales, bisagra, unipodal y landing.',
    sources: [
      {
        kind: 'criterion',
        testCode: 'deep_squat_overhead',
        criterionCode: 'trunk',
        weight: 0.25,
        label: 'Deep Squat · tronco',
      },
      {
        kind: 'criterion',
        testCode: 'hip_hinge',
        criterionCode: 'spine_control',
        weight: 0.3,
        label: 'Bisagra · control de columna',
      },
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'trunk',
        side: 'worst',
        weight: 0.25,
        label: 'Unipodal · tronco (peor lado)',
      },
      {
        kind: 'criterion',
        testCode: 'landing_bilateral',
        criterionCode: 'trunk',
        weight: 0.2,
        label: 'Landing · tronco',
      },
    ],
  },
  {
    code: 'patron_bisagra',
    label: 'Patrón de bisagra',
    shortLabel: 'Bisagra',
    description: 'Calidad del patrón de bisagra de cadera observado (no mide fuerza de cadena posterior).',
    sources: [
      {
        kind: 'criterion',
        testCode: 'hip_hinge',
        criterionCode: 'hip_motion',
        weight: 0.3,
        label: 'Movimiento de cadera',
      },
      {
        kind: 'criterion',
        testCode: 'hip_hinge',
        criterionCode: 'spine_control',
        weight: 0.3,
        label: 'Control de columna',
      },
      {
        kind: 'criterion',
        testCode: 'hip_hinge',
        criterionCode: 'knee_control',
        weight: 0.2,
        label: 'Control de rodilla',
      },
      {
        kind: 'criterion',
        testCode: 'hip_hinge',
        criterionCode: 'coordination',
        weight: 0.2,
        label: 'Coordinación',
      },
    ],
  },
  {
    code: 'control_unilateral',
    label: 'Control unilateral',
    shortLabel: 'Unipodal',
    description: 'Estabilidad de pelvis, tronco y equilibrio en sentadilla unipodal.',
    sources: [
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'pelvis',
        side: 'worst',
        weight: 0.3,
        label: 'Pelvis (peor lado)',
      },
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'trunk',
        side: 'worst',
        weight: 0.25,
        label: 'Tronco (peor lado)',
      },
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'balance',
        side: 'worst',
        weight: 0.25,
        label: 'Equilibrio (peor lado)',
      },
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'knee',
        side: 'worst',
        weight: 0.2,
        label: 'Rodilla (peor lado)',
      },
    ],
  },
  {
    code: 'absorcion',
    label: 'Absorción y estabilización',
    shortLabel: 'Absorción',
    description: 'Control al absorber la caída y estabilizar la recepción (Landing STP, no Drop Jump Ivolution).',
    sources: [
      {
        kind: 'criterion',
        testCode: 'landing_bilateral',
        criterionCode: 'absorption',
        weight: 0.55,
        label: 'Landing · absorción',
      },
      {
        kind: 'criterion',
        testCode: 'landing_bilateral',
        criterionCode: 'final_stability',
        weight: 0.45,
        label: 'Landing · estabilidad final',
      },
    ],
  },
  {
    code: 'control_rodilla',
    label: 'Control de rodilla',
    shortLabel: 'Rodilla',
    description: 'Alineación y control de rodillas en patrones globales, bisagra, unipodal y landing.',
    sources: [
      {
        kind: 'criterion',
        testCode: 'deep_squat_overhead',
        criterionCode: 'knees',
        weight: 0.25,
        label: 'Deep Squat · rodillas',
      },
      {
        kind: 'criterion',
        testCode: 'hip_hinge',
        criterionCode: 'knee_control',
        weight: 0.2,
        label: 'Bisagra · control de rodilla',
      },
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'knee',
        side: 'worst',
        weight: 0.3,
        label: 'Unipodal · rodilla (peor lado)',
      },
      {
        kind: 'criterion',
        testCode: 'landing_bilateral',
        criterionCode: 'knees',
        weight: 0.25,
        label: 'Landing · rodillas',
      },
    ],
  },
  {
    code: 'equilibrio_estabilidad',
    label: 'Equilibrio y estabilidad',
    shortLabel: 'Estabilidad',
    description: 'Capacidad de estabilizar en patrones globales, unipodales y post-landing.',
    sources: [
      {
        kind: 'criterion',
        testCode: 'deep_squat_overhead',
        criterionCode: 'balance',
        weight: 0.3,
        label: 'Deep Squat · equilibrio',
      },
      {
        kind: 'criterion',
        testCode: 'single_leg_squat',
        criterionCode: 'balance',
        side: 'worst',
        weight: 0.35,
        label: 'Unipodal · equilibrio (peor lado)',
      },
      {
        kind: 'criterion',
        testCode: 'landing_bilateral',
        criterionCode: 'final_stability',
        weight: 0.35,
        label: 'Landing · estabilidad final',
      },
    ],
  },
];
