import { Injectable } from '@nestjs/common';
import type { CategoryScores, TrainingDecision, TriggeredRule } from './analysis.types';

/**
 * v1 determinístico: traduce reglas disparadas y scores a prioridades / restricciones
 * para integración futura con planificador de sesiones.
 */
@Injectable()
export class TrainingDecisionService {
  build(triggered: TriggeredRule[], scores: CategoryScores): TrainingDecision {
    const ruleIds = new Set(triggered.map((t) => t.rule.id));

    const priorities = new Set<string>();
    const restrictions = new Set<string>();
    const prioritize = new Set<string>();
    const avoid = new Set<string>();

    if (ruleIds.has('asimetria_alta') || ruleIds.has('asimetria_mccall_alta')) {
      priorities.add('simetria_bilateral');
      restrictions.add('limitar_pliometria_unilateral_explosiva');
      avoid.add('alto_impacto_unilateral');
      prioritize.add('fuerza_unilateral_controlada');
      prioritize.add('isometria_asimetrica');
    } else if (ruleIds.has('asimetria_moderada')) {
      priorities.add('monitoreo_simetria');
      prioritize.add('trabajo_unilateral_submaximal');
    }

    if (ruleIds.has('reactividad_muy_baja') || ruleIds.has('reactividad_baja')) {
      priorities.add('reactividad');
      prioritize.add('pliometria_progresiva');
      prioritize.add('multisaltos_baja_intensidad');
    }

    if (ruleIds.has('contacto_lento')) {
      priorities.add('acortar_tiempo_contacto');
      prioritize.add('saltos_rapidos_baja_amplitud');
    }

    if (ruleIds.has('fuerza_relativa_baja')) {
      priorities.add('fuerza_maxima');
      prioritize.add('isometria_fundamental');
      restrictions.add('evitar_complejidad_alta_sin_base');
    }

    if (ruleIds.has('elasticidad_baja')) {
      priorities.add('ciclo_elastico');
      prioritize.add('contramovimiento_tecnico');
    }

    if (ruleIds.has('mala_reutilizacion') || ruleIds.has('perfil_elastico')) {
      priorities.add('transferencia_exc_conc');
      prioritize.add(ruleIds.has('perfil_elastico') ? 'fuerza_maxima' : 'pliometria');
    }

    if (ruleIds.has('fatiga_alta')) {
      priorities.add('resistencia_neuromuscular');
      prioritize.add('repeticion_esfuerzos_submaximales');
    }

    if (ruleIds.has('perfil_deficit_global')) {
      priorities.add('base_condicional');
      prioritize.add('coordinacion_fuerza');
    }

    let suggestedPhase: string | null = null;
    const fuerza = scores.fuerza;
    const react = scores.reactividad;
    const pot = scores.potencia;

    if (ruleIds.has('perfil_deficit_global') || (fuerza != null && fuerza <= 2 && pot != null && pot <= 2)) {
      suggestedPhase = 'adaptacion_hipertrofia_1';
    } else if (fuerza != null && fuerza >= 3 && react != null && react <= 2) {
      suggestedPhase = 'potencia_reactiva';
    } else if (fuerza != null && fuerza <= 2.5) {
      suggestedPhase = 'hipertrofia_fuerza';
    } else if (pot != null && pot <= 2.5 && (fuerza == null || fuerza >= 3)) {
      suggestedPhase = 'potencia_explosiva';
    }

    return {
      priorities: [...priorities],
      restrictions: [...restrictions],
      suggestedPhase,
      exerciseHints: {
        prioritize: [...prioritize],
        avoid: [...avoid],
      },
    };
  }
}
