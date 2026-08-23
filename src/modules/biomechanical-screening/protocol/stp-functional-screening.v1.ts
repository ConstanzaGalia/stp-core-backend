/**
 * Catálogo del Functional Screening Biomecánico STP v1.
 * Fuente de verdad de tests, criterios, opciones y umbrales.
 * La UI no debe hardcodear esta batería: la consume desde la API.
 */

export const SCREENING_PROTOCOL_CODE = 'functional_screening_stp';
export const SCREENING_PROTOCOL_VERSION = 1;

export type ObservationOptionCode = 'adecuado' | 'compensado' | 'limitado';
export type ScreeningClassification = 'adecuado' | 'atencion' | 'limitado';
export type ScreeningDomainCode =
  | 'MOVILIDAD'
  | 'MOVIMIENTO_GLOBAL'
  | 'BISAGRA'
  | 'CONTROL_UNIPODAL'
  | 'LANDING';
export type ScreeningScoringMode = 'quantitative' | 'criteria' | 'criteria_bilateral';
export type ScreeningSide = 'left' | 'right';

export interface ObservationOptionDef {
  code: ObservationOptionCode;
  label: string;
  points: number;
  hint: string;
}

export interface ScreeningCriterionDef {
  code: string;
  label: string;
  description: string;
}

export interface ScreeningCompensationDef {
  code: string;
  label: string;
}

export interface ScreeningTestDef {
  code: string;
  sortOrder: number;
  name: string;
  domain: ScreeningDomainCode;
  domainLabel: string;
  scoringMode: ScreeningScoringMode;
  maxScore: number;
  videoSuggested: boolean;
  objective: string;
  material: string[];
  position: string[];
  execution: string[];
  importantNotes: string[];
  criteria: ScreeningCriterionDef[];
  compensations: ScreeningCompensationDef[];
  primaryCompensationOptions?: ScreeningCompensationDef[];
  invalidReasons?: ScreeningCompensationDef[];
}

export interface KneeToWallConfig {
  goodMinCm: number;
  attentionMinCm: number;
  asymmetryThresholdCm: number;
}

export interface LandingConfig {
  boxHeightCm: number;
  familiarizationAttemptsMax: number;
  validAttempts: number;
  stabilizeSeconds: number;
}

export interface ScreeningProtocolDefinition {
  code: string;
  version: number;
  name: string;
  shortName: string;
  description: string;
  observationOptions: ObservationOptionDef[];
  config: {
    kneeToWall: KneeToWallConfig;
    landing: LandingConfig;
  };
  tests: ScreeningTestDef[];
}

export const OBSERVATION_OPTIONS: ObservationOptionDef[] = [
  {
    code: 'adecuado',
    label: 'Adecuado',
    points: 2,
    hint: 'Cumple el criterio sin una compensación relevante.',
  },
  {
    code: 'compensado',
    label: 'Compensado',
    points: 1,
    hint: 'Puede realizar el movimiento, pero aparece una compensación observable.',
  },
  {
    code: 'limitado',
    label: 'Limitado',
    points: 0,
    hint: 'No consigue realizar correctamente el criterio.',
  },
];

export const STP_FUNCTIONAL_SCREENING_V1: ScreeningProtocolDefinition = {
  code: SCREENING_PROTOCOL_CODE,
  version: SCREENING_PROTOCOL_VERSION,
  name: 'Functional Screening Biomecánico STP',
  shortName: 'Screening biomecánico',
  description:
    'Observación estandarizada de patrones fundamentales de movimiento. El profesor observa; STP puntúa. No diagnostica lesiones ni reemplaza una evaluación médica.',
  observationOptions: OBSERVATION_OPTIONS,
  config: {
    kneeToWall: {
      goodMinCm: 10,
      attentionMinCm: 8,
      asymmetryThresholdCm: 1.5,
    },
    landing: {
      boxHeightCm: 30,
      familiarizationAttemptsMax: 3,
      validAttempts: 3,
      stabilizeSeconds: 2,
    },
  },
  tests: [
    {
      code: 'knee_to_wall',
      sortOrder: 1,
      name: 'Knee to Wall',
      domain: 'MOVILIDAD',
      domainLabel: 'Movilidad',
      scoringMode: 'quantitative',
      maxScore: 4,
      videoSuggested: false,
      objective:
        'Evaluar la movilidad de dorsiflexión del tobillo en carga y comparar ambos miembros.',
      material: ['Pared', 'Cinta métrica o regla', 'Marcador o cinta (opcional)'],
      position: [
        'El atleta se coloca frente a la pared.',
        'El pie evaluado apunta hacia adelante.',
        'El talón debe permanecer completamente apoyado.',
        'La rodilla se dirige hacia la pared aproximadamente siguiendo la línea del segundo dedo.',
      ],
      execution: [
        'El atleta lleva la rodilla hacia la pared.',
        'Si toca fácilmente, aleja progresivamente el pie.',
        'Busca la máxima distancia posible manteniendo el talón apoyado.',
        'Registrar la distancia entre el dedo gordo y la pared en centímetros.',
        'Repetir en ambos miembros.',
      ],
      importantNotes: [
        'Guardar siempre el valor crudo en centímetros.',
        'Los rangos son una regla operativa inicial de STP, no un criterio clínico universal.',
      ],
      criteria: [],
      compensations: [],
    },
    {
      code: 'deep_squat_overhead',
      sortOrder: 2,
      name: 'Deep Squat + Overhead',
      domain: 'MOVIMIENTO_GLOBAL',
      domainLabel: 'Movimiento global',
      scoringMode: 'criteria',
      maxScore: 10,
      videoSuggested: true,
      objective:
        'Observar el patrón global de sentadilla: movilidad de tobillo y cadera, control de rodillas y tronco, overhead y equilibrio.',
      material: ['Bastón o palo liviano'],
      position: [
        'Pies aproximadamente al ancho de hombros.',
        'Pies orientados hacia adelante o con una apertura natural.',
        'Bastón sostenido con ambas manos, brazos elevados por encima de la cabeza.',
        'Cuerpo erguido.',
      ],
      execution: [
        'Realizar una sentadilla profunda.',
        'Descender de manera controlada.',
        'Mantener los pies apoyados y los brazos elevados.',
        'Llegar a la máxima profundidad posible manteniendo el patrón.',
        'Volver a la posición inicial.',
      ],
      importantNotes: [
        'No es el scoring oficial del FMS. STP usa criterios propios.',
        'Puede haber más de una compensación.',
      ],
      criteria: [
        {
          code: 'depth',
          label: 'Profundidad',
          description: 'Alcanza una profundidad funcional sin perder el patrón.',
        },
        {
          code: 'knees',
          label: 'Rodillas',
          description: 'Control y alineación de rodillas durante el descenso y el ascenso.',
        },
        {
          code: 'trunk',
          label: 'Tronco',
          description: 'Mantiene el tronco controlado, sin una inclinación o pérdida clara.',
        },
        {
          code: 'overhead',
          label: 'Overhead',
          description: 'Mantiene la posición de brazos elevados sin compensar en exceso.',
        },
        {
          code: 'balance',
          label: 'Equilibrio',
          description: 'Permanece estable o realiza solo correcciones menores.',
        },
      ],
      compensations: [
        { code: 'ankle', label: 'Tobillo' },
        { code: 'knee', label: 'Rodilla' },
        { code: 'hip', label: 'Cadera' },
        { code: 'trunk', label: 'Tronco' },
        { code: 'shoulder_overhead', label: 'Hombro / Overhead' },
        { code: 'balance', label: 'Equilibrio' },
      ],
    },
    {
      code: 'hip_hinge',
      sortOrder: 3,
      name: 'Bisagra de cadera',
      domain: 'BISAGRA',
      domainLabel: 'Bisagra',
      scoringMode: 'criteria',
      maxScore: 8,
      videoSuggested: true,
      objective:
        'Evaluar la capacidad de realizar el patrón de bisagra de cadera (base de peso muerto, RDL, buenos días e hip thrust).',
      material: ['Bastón o palo liviano'],
      position: [
        'Pies aproximadamente al ancho de cadera.',
        'Rodillas ligeramente flexionadas.',
        'El atleta sostiene el bastón a lo largo de la espalda.',
        'Tres puntos de contacto: cabeza, dorsales y sacro.',
      ],
      execution: [
        'Llevar la cadera hacia atrás manteniendo el bastón alineado.',
        'Mantener una flexión moderada de rodillas.',
        'Los tres puntos de contacto (cabeza, dorsales y sacro) deben permanecer apoyados para observar la alineación de columna.',
        'Llegar al rango que pueda controlar.',
        'Volver extendiendo la cadera.',
        'Realizar 2 a 3 repeticiones.',
      ],
      importantNotes: [
        'Si se despega la cabeza, las dorsales o el sacro, hay pérdida de alineación.',
        'No debe convertirse en una sentadilla.',
      ],
      criteria: [
        {
          code: 'hip_motion',
          label: 'Movimiento de cadera',
          description: 'La cadera realiza el movimiento principal.',
        },
        {
          code: 'spine_control',
          label: 'Control de columna',
          description: 'Mantiene los 3 puntos de contacto: cabeza, dorsales y sacro.',
        },
        {
          code: 'knee_control',
          label: 'Control de rodilla',
          description: 'Flexión adecuada, sin convertirse en sentadilla.',
        },
        {
          code: 'coordination',
          label: 'Coordinación',
          description: 'El movimiento es fluido y coordinado.',
        },
      ],
      compensations: [],
      primaryCompensationOptions: [
        { code: 'spine_control', label: 'Control de columna' },
        { code: 'mobility', label: 'Movilidad' },
        { code: 'knee_control', label: 'Control de rodilla' },
        { code: 'coordination', label: 'Coordinación' },
        { code: 'balance', label: 'Equilibrio' },
      ],
    },
    {
      code: 'single_leg_squat',
      sortOrder: 4,
      name: 'Sentadilla unipodal',
      domain: 'CONTROL_UNIPODAL',
      domainLabel: 'Control unipodal',
      scoringMode: 'criteria_bilateral',
      maxScore: 16,
      videoSuggested: true,
      objective:
        'Evaluar el control del miembro inferior durante una tarea unilateral, exactamente igual en izquierda y derecha.',
      material: [],
      position: [
        'Atleta de pie sobre una pierna.',
        'Pierna contraria separada del suelo.',
        'Brazos al frente o sobre las caderas.',
        'Mirada al frente.',
      ],
      execution: [
        'Realizar una sentadilla sobre una pierna.',
        'Descender hasta una profundidad que permita observar el patrón.',
        'Mantener el control y volver a la posición inicial.',
        'Realizar 2 a 3 repeticiones.',
        'Repetir en el otro lado.',
      ],
      importantNotes: [
        'No asumir que una compensación biomecánica significa menor fuerza.',
        'Esta información se podrá comparar después con McCall izquierda y derecha.',
      ],
      criteria: [
        {
          code: 'knee',
          label: 'Rodilla',
          description: 'Mantiene alineación y control de la rodilla de apoyo.',
        },
        {
          code: 'pelvis',
          label: 'Pelvis',
          description: 'La pelvis permanece estable.',
        },
        {
          code: 'trunk',
          label: 'Tronco',
          description: 'El tronco permanece estable, sin compensación marcada.',
        },
        {
          code: 'balance',
          label: 'Equilibrio',
          description: 'Permanece estable o realiza solo correcciones menores.',
        },
      ],
      compensations: [],
    },
    {
      code: 'landing_bilateral',
      sortOrder: 5,
      name: 'Landing / Drop Landing bilateral',
      domain: 'LANDING',
      domainLabel: 'Landing',
      scoringMode: 'criteria',
      maxScore: 10,
      videoSuggested: true,
      objective:
        'Evaluar cómo absorbe y estabiliza el atleta una caída. No es el Drop Jump de Ivolution.',
      material: ['Cajón de 30 cm (altura configurable)'],
      position: [
        'Atleta parado sobre el cajón.',
        'Pies aproximadamente al ancho de cadera.',
        'Manos sobre las caderas o la cintura.',
      ],
      execution: [
        'Instrucción: “Dejate caer y estabilizá la recepción.”',
        'Sale del cajón mediante una caída controlada. No realiza un salto voluntario.',
        'Aterriza con ambos pies, absorbe la caída y estabiliza unos 2 segundos.',
        '2 a 3 intentos de familiarización si es necesario, luego 3 intentos válidos.',
      ],
      importantNotes: [
        'Este test no es el Drop Jump de Ivolution.',
        'El Drop Jump pregunta cómo utiliza la recepción para producir fuerza otra vez.',
        'Si un intento no cumple el protocolo, puede repetirse y marcarse como inválido.',
      ],
      criteria: [
        {
          code: 'absorption',
          label: 'Absorción',
          description: 'Utiliza tobillo, rodilla y cadera para absorber la caída.',
        },
        {
          code: 'knees',
          label: 'Rodillas',
          description: 'Buen control de rodillas en la recepción.',
        },
        {
          code: 'trunk',
          label: 'Tronco',
          description: 'El tronco permanece estable al aterrizar.',
        },
        {
          code: 'final_stability',
          label: 'Estabilidad final',
          description: 'Estabiliza aproximadamente en 2 segundos.',
        },
        {
          code: 'symmetry',
          label: 'Simetría',
          description: 'Recepción visualmente equilibrada entre ambos lados.',
        },
      ],
      compensations: [
        { code: 'stiff', label: 'Recepción rígida' },
        { code: 'knee', label: 'Rodilla' },
        { code: 'trunk', label: 'Tronco' },
        { code: 'balance', label: 'Equilibrio' },
        { code: 'asymmetry', label: 'Asimetría' },
      ],
      invalidReasons: [
        { code: 'voluntary_jump', label: 'Salta voluntariamente desde el cajón' },
        { code: 'not_bilateral', label: 'No permite evaluar el patrón bilateral' },
        { code: 'lost_balance', label: 'Pierde completamente el equilibrio' },
        { code: 'extra_steps', label: 'Necesita pasos adicionales' },
        { code: 'no_stabilize', label: 'No consigue estabilizar' },
        { code: 'pain', label: 'Aparece dolor' },
      ],
    },
  ],
};

export function getObservationPoints(code: ObservationOptionCode): number {
  const option = OBSERVATION_OPTIONS.find((item) => item.code === code);
  return option?.points ?? 0;
}

export function findTestDef(
  definition: ScreeningProtocolDefinition,
  testCode: string,
): ScreeningTestDef | undefined {
  return definition.tests.find((test) => test.code === testCode);
}
