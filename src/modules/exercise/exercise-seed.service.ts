import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MovementPattern } from 'src/entities/movement-pattern.entity';
import { Category } from 'src/entities/category.entity';
import { SafetyTag, BodyZone } from 'src/entities/safety-tag.entity';

const MOVEMENT_PATTERNS = [
  { name: 'Dominante de Rodilla', description: 'Sentadillas, estocadas, step-ups' },
  { name: 'Dominante de Cadera', description: 'Peso muerto, hip thrust' },
  { name: 'Empuje Horizontal', description: 'Press banca, flexiones' },
  { name: 'Empuje Vertical', description: 'Press militar, press hombros' },
  { name: 'Tracción Horizontal', description: 'Remo con barra, TRX, polea' },
  { name: 'Tracción Vertical', description: 'Dominadas, polea alta' },
  { name: 'Rotación', description: 'Leñadores, lanzamientos rotacionales' },
  { name: 'Anti-extensión', description: 'Plancha, rueda abdominal' },
  { name: 'Anti-flexión', description: 'Dead bug, hollow hold, resistencia a flexión lumbar' },
  { name: 'Anti-rotación', description: 'Pallof press, plancha lateral' },
  { name: 'Core Tradicional', description: 'Abs crunch, cortitos, tijeras' },
  { name: 'Saltos y Rebotes', description: 'Saltos, depth jump, reactividad pliométrica' },
  { name: 'Compuestos', description: 'Movimientos combinados (sentadilla + press)' },
  {
    name: 'Derivado olímpico',
    description: 'Arranque, cargadas, tirones y derivados de levantamiento olímpico',
  },
  {
    name: 'Balístico',
    description: 'Swings, slams y lanzamientos con aceleración de carga (no pliometría)',
  },
];

const CATEGORIES = [
  { name: 'Empuje', description: 'Ejercicios de empuje (press, flexiones)' },
  { name: 'Tracción', description: 'Ejercicios de tracción (remos, dominadas)' },
  { name: 'Piernas', description: 'Ejercicios de tren inferior' },
  { name: 'Core', description: 'Ejercicios de estabilidad y fuerza central' },
  { name: 'Metabólico', description: 'Ejercicios de acondicionamiento metabólico' },
  { name: 'Pliométrico', description: 'Ejercicios de potencia y reactividad' },
  { name: 'Movilidad', description: 'Ejercicios de movilidad articular y flexibilidad' },
  {
    name: 'Levantamiento olímpico',
    description: 'Levantamientos olímpicos y derivados (arranque, cargada, etc.)',
  },
  {
    name: 'Balísticos',
    description: 'Producción rápida de fuerza: swings, slams, lanzamientos de balón',
  },
];

const SAFETY_TAGS: { key: string; description: string; bodyZone: BodyZone }[] = [
  // Columna Vertebral
  { key: 'no_carga_axial', description: 'Evita peso sobre columna', bodyZone: BodyZone.COLUMNA },
  { key: 'no_flexion_lumbar', description: 'Evita flexión lumbar bajo carga', bodyZone: BodyZone.COLUMNA },
  { key: 'no_extension_lumbar', description: 'Evita hiperextensión lumbar', bodyZone: BodyZone.COLUMNA },
  { key: 'no_rotacion_columna', description: 'Evita torsión de columna', bodyZone: BodyZone.COLUMNA },
  // Tren Inferior
  { key: 'no_impacto', description: 'Evita saltos y carrera', bodyZone: BodyZone.TREN_INFERIOR },
  { key: 'no_flexion_profunda_rodilla', description: 'Evita sentadillas profundas', bodyZone: BodyZone.TREN_INFERIOR },
  { key: 'no_unilateral', description: 'Problemas de cadera, evita ejercicios unilaterales', bodyZone: BodyZone.TREN_INFERIOR },
  { key: 'no_flexion_cadera', description: 'Evita flexión de cadera bajo carga', bodyZone: BodyZone.TREN_INFERIOR },
  { key: 'no_rotacion_cadera', description: 'Evita rotación de cadera bajo carga', bodyZone: BodyZone.TREN_INFERIOR },
  // Tren Superior
  { key: 'no_rango_overhead', description: 'Evita movimientos por encima de la cabeza', bodyZone: BodyZone.TREN_SUPERIOR },
  { key: 'no_traccion_colgada', description: 'Evita dominadas y colgarse', bodyZone: BodyZone.TREN_SUPERIOR },
  { key: 'no_apoyo_palmar', description: 'Evita apoyo en muñecas', bodyZone: BodyZone.TREN_SUPERIOR },
  { key: 'no_estres_escapula', description: 'Evita cargas en escápula', bodyZone: BodyZone.TREN_SUPERIOR },
  { key: 'no_empuje_dinamico', description: 'Evita empujes explosivos de tren superior', bodyZone: BodyZone.TREN_SUPERIOR },
  { key: 'no_flexion_supina', description: 'Evita flexión en posición supina', bodyZone: BodyZone.TREN_SUPERIOR },
  // Hombro
  { key: 'no_abduccion_hombro', description: 'Evita abducción de hombro (vuelos laterales, elevaciones laterales)', bodyZone: BodyZone.HOMBRO },
  { key: 'no_rotacion_externa_carga', description: 'Evita rotación externa bajo carga (manguito rotador)', bodyZone: BodyZone.HOMBRO },
  { key: 'no_rotacion_interna_carga', description: 'Evita rotación interna bajo carga', bodyZone: BodyZone.HOMBRO },
  { key: 'no_empuje_horizontal_carga', description: 'Evita empujes horizontales bajo carga (press banca, flexiones)', bodyZone: BodyZone.HOMBRO },
  { key: 'no_pinzamiento_hombro', description: 'Evita patrones de pinzamiento subacromial (elevación >90°, press inclinado)', bodyZone: BodyZone.HOMBRO },
  { key: 'no_inestabilidad_hombro', description: 'Evita posiciones de inestabilidad glenohumeral (rangos extremos, carga en posiciones inestables)', bodyZone: BodyZone.HOMBRO },
  // Condiciones Sistémicas
  { key: 'no_isometrico_puro', description: 'Evita isometrías prolongadas', bodyZone: BodyZone.SISTEMICO },
  { key: 'no_valsalva', description: 'Evita apnea / maniobra de Valsalva', bodyZone: BodyZone.SISTEMICO },
  { key: 'no_supino', description: 'Evita posición boca arriba', bodyZone: BodyZone.SISTEMICO },
  { key: 'no_cabeza_abajo', description: 'Evita inversiones', bodyZone: BodyZone.SISTEMICO },
  { key: 'no_metabolico', description: 'Evita trabajo metabólico intenso', bodyZone: BodyZone.SISTEMICO },
];

@Injectable()
export class ExerciseSeedService implements OnModuleInit {
  private readonly logger = new Logger(ExerciseSeedService.name);

  constructor(
    @InjectRepository(MovementPattern)
    private readonly movementPatternRepo: Repository<MovementPattern>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SafetyTag)
    private readonly safetyTagRepo: Repository<SafetyTag>,
  ) {}

  async onModuleInit() {
    await this.seedMovementPatterns();
    await this.seedCategories();
    await this.seedSafetyTags();
  }

  private async seedMovementPatterns() {
    this.logger.log('Upserting movement patterns (insert missing by name)...');
    for (const pattern of MOVEMENT_PATTERNS) {
      const exists = await this.movementPatternRepo.findOneBy({ name: pattern.name });
      if (exists) continue;
      await this.movementPatternRepo.save(pattern);
      this.logger.log(`Inserted movement pattern: ${pattern.name}`);
    }
  }

  private async seedCategories() {
    this.logger.log('Upserting categories (insert missing by name)...');
    for (const category of CATEGORIES) {
      const exists = await this.categoryRepo.findOneBy({ name: category.name });
      if (exists) continue;
      await this.categoryRepo.save(category);
      this.logger.log(`Inserted category: ${category.name}`);
    }
  }

  private async seedSafetyTags() {
    this.logger.log('Upserting safety tags...');
    await this.safetyTagRepo.upsert(SAFETY_TAGS, { conflictPaths: ['key'] });
  }
}
