/**
 * Migra filas de `athlete_evaluation` a `physical_evaluation` + un test sintético por fila.
 * Ejecutar manualmente: npx ts-node -r tsconfig-paths/register scripts/migrate-legacy-evaluations-to-physical.ts
 *
 * Requiere variables de entorno de BD (p. ej. DATABASE_URL) como el resto del backend.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AthleteEvaluation } from '../src/entities/athlete-evaluation.entity';
import { PhysicalEvaluation } from '../src/entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from '../src/entities/physical-evaluation-test.entity';
import { User } from '../src/entities/user.entity';

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const sslEnabled = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';

  const dataSource = new DataSource(
    databaseUrl
      ? {
          type: 'postgres',
          url: databaseUrl,
          entities: [User, AthleteEvaluation, PhysicalEvaluation, PhysicalEvaluationTest],
          synchronize: false,
          ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        }
      : {
          type: 'postgres',
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT || 5432),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          entities: [User, AthleteEvaluation, PhysicalEvaluation, PhysicalEvaluationTest],
          synchronize: false,
          ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        },
  );

  await dataSource.initialize();
  const legacyRepo = dataSource.getRepository(AthleteEvaluation);
  const physRepo = dataSource.getRepository(PhysicalEvaluation);

  const legacy = await legacyRepo.find({ relations: ['user'], order: { createdAt: 'ASC' } });
  let migrated = 0;
  for (const row of legacy) {
    const uid = row.user?.id;
    if (!uid) continue;

    const exists = await physRepo
      .createQueryBuilder('pe')
      .innerJoin('pe.tests', 't')
      .where('pe.user_id = :uid', { uid })
      .andWhere('t.test_type = :tt', { tt: 'stp_legacy' })
      .andWhere('(t.metrics->>\'legacyEvaluationId\') = :lid', { lid: row.id })
      .getOne();
    if (exists) continue;

    const ev = new PhysicalEvaluation();
    ev.user = row.user;
    ev.evaluationDate = row.createdAt;
    ev.summaryScore = Math.min(100, Math.max(0, (row.scoreTotal / 5) * 100));
    ev.summaryAnalysis = `Evaluación STP importada (legacy). Nivel STP ${row.stpLevel}, score ${row.scoreTotal}. Dimensiones: experiencia ${row.experiencia}, control motor ${row.controlMotor}, capacidad estructural ${row.capacidadEstructural}.${row.notas ? ` Notas: ${row.notas}` : ''}`;

    const test = new PhysicalEvaluationTest();
    test.testName = 'Evaluación STP (importada)';
    test.testType = 'stp_legacy';
    test.metrics = {
      legacyEvaluationId: row.id,
      experiencia: row.experiencia,
      controlMotor: row.controlMotor,
      capacidadEstructural: row.capacidadEstructural,
      scoreTotal: row.scoreTotal,
      stpLevel: row.stpLevel,
      notas: row.notas ?? null,
    };
    ev.tests = [test];

    await physRepo.save(ev);
    migrated++;
  }

  console.log(`Migradas ${migrated} evaluaciones legacy a physical_evaluation (omitidas ya importadas).`);
  await dataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
