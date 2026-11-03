import { FileMetricsExtractionService } from '../file-metrics-extraction.service';
import { evaluateTestRepetitions } from './rep-metric-specs';

/** Exports reales de Ivolution (una repetición por archivo), sin datos personales. */
const CMJ = `Característica;Repetición 1
Tiempo de Contacto;0,738
Asimetría Propulsiva;-6,6
Fuerza Max Propulsiva Der;714,0
Altura de Salto;0,28671
Asimetría Aterrizaje;-19,4
Fuerza Max Propulsiva Izq;667,0
Tiempo de estabilización;0,915
RSI;1,05
Velocidad Máxima de Despegue;2,37
Asimetría Frenado;-12,1
Eficiencia (TV/TC);0,593
Peso;621,44
Fuerza Max Frenado Der;677,0
Fuerza Max Frenado Izq;595,0
Tiempo de Vuelo;0,44
`;

const DROP_JUMP = `Característica;Repetición 1
Tiempo de contacto;0,356
Fuerza Pico;2120,198
Asimetría Fuerza Pico;9,616
RSI;1,388
Tiempo de Vuelo;0,494
Altura de Salto;0,3
Fuerza Pico Izquierda;1128,157
Fuerza Pico Derecha;1015,969
`;

const MCCALL_DER = `Característica,Repetición 1
Fuerza Media,"117,8"
Asimetría Fuerza Pico,100
Fuerza Pico Izquierda,0
Fuerza Pico Derecha,135
Fuerza Pico,"135,7"
Tiempo de Empuje,"2,995"
`;

const MCCALL_IZQ = `Característica,Repetición 1
Fuerza Media,"142,4"
Asimetría Fuerza Pico,-100
Fuerza Pico Izquierda,156
Fuerza Pico Derecha,0
Fuerza Pico,"156,9"
Tiempo de Empuje,"2,995"
`;

const extractor = new FileMetricsExtractionService();
const evaluate = (testType: string, csv: string) =>
  evaluateTestRepetitions(
    testType,
    extractor.extractFromCsv(testType, csv).repetitions,
  )!;

describe('exports reales de Ivolution', () => {
  it('CMJ: reconoce las columnas, valida la altura contra la velocidad de despegue y pasa metros a cm', () => {
    const r = evaluate('cmj', CMJ);
    expect(r.reps[0].reasons).toEqual([]);
    expect(r.metrics.altura_de_salto.used).toBeCloseTo(28.67, 1);
    expect(r.metrics.rsi.used).toBeCloseTo(1.05, 2);
    expect(r.metrics.eficiencia.used).toBeCloseTo(0.593, 3);
    expect(r.metrics.tiempo_estabilizacion.used).toBeCloseTo(0.915, 3);
    expect(r.metrics.asimetria_frenado.used).toBeCloseTo(12.1, 1);
    expect(r.metrics.asimetria_aterrizaje.used).toBeCloseTo(19.4, 1);
  });

  it('CMJ: la regla de altura contra velocidad de despegue se aplica de verdad', () => {
    const tampered = CMJ.replace(
      'Altura de Salto;0,28671',
      'Altura de Salto;0,0392',
    );
    const r = evaluate('cmj', tampered);
    expect(r.reps[0].status).toBe('excluded_rule');
    expect(r.validCount).toBe(0);
  });

  it('CMJ con una sola repetición: resultado preliminar y la asimetría no se declara patrón', () => {
    const r = evaluate('cmj', CMJ);
    expect(r.validCount).toBe(1);
    expect(r.preliminary).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.metrics.asimetria_frenado.asymmetry?.kind).toBe('single_rep');
    expect(r.metrics.asimetria_frenado.asymmetry?.side).toBe('right');
  });

  it('el signo negativo coincide con la pierna derecha mayor en los datos del export', () => {
    // Frenado: Der 677 N, Izq 595 N → (677-595)/677 = 12,1 % y el export informa -12,1.
    expect((677 - 595) / 677).toBeCloseTo(0.121, 3);
  });

  it('Drop Jump: reconoce RSI, contacto, altura y asimetría de fuerza pico', () => {
    const r = evaluate('drop_jump', DROP_JUMP);
    expect(r.metrics.rsi.used).toBeCloseTo(1.388, 3);
    expect(r.metrics.tiempo_contacto.used).toBeCloseTo(0.356, 3);
    expect(r.metrics.altura_de_salto.used).toBeCloseTo(30, 0);
    expect(r.metrics.asimetria_fuerza_pico.used).toBeCloseTo(9.616, 3);
  });

  it('McCall: toma la fuerza pico de cada pierna (coma como separador, decimales entre comillas)', () => {
    const der = evaluate('mccall_der', MCCALL_DER);
    const izq = evaluate('mccall_izq', MCCALL_IZQ);
    expect(der.metrics.fuerza_isometrica.used).toBeCloseTo(135.7, 1);
    expect(izq.metrics.fuerza_isometrica.used).toBeCloseTo(156.9, 1);
  });
});

describe('consistencia de asimetrías con las fuerzas por pierna', () => {
  it('los exports de CMJ cierran: la asimetría informada coincide con la de las fuerzas Der/Izq', () => {
    expect(evaluate('cmj', CMJ).dataWarnings).toEqual([]);
  });

  it('avisa cuando la asimetría del Drop Jump no coincide con las fuerzas pico por pierna', () => {
    const dj = `Característica,Repetición 1
Tiempo de contacto,"0,337"
Asimetría Fuerza Pico,"8,277"
RSI,"1,749"
Altura de Salto,"0,425"
Fuerza Pico Izquierda,"1648,694"
Fuerza Pico Derecha,"1308,207"
`;
    const r = evaluate('drop_jump', dj);
    expect(r.dataWarnings).toHaveLength(1);
    expect(r.dataWarnings[0].computed).toBeCloseTo(20.7, 1);
    expect(r.reps[0].included).toBe(true);
  });

  it('el Drop Jump que cierra no genera aviso', () => {
    expect(evaluate('drop_jump', DROP_JUMP).dataWarnings).toEqual([]);
  });

  it('una asimetría chica no se marca como "una sola repetición"', () => {
    const tiny = CMJ.replace(
      'Asimetría Frenado;-12,1',
      'Asimetría Frenado;-0,3',
    );
    expect(
      evaluate('cmj', tiny).metrics.asimetria_frenado.asymmetry?.kind,
    ).toBe('small');
  });
});
