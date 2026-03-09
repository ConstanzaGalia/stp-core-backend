/**
 * Script para insertar horarios fijos de alumnos en athlete_schedules.
 *
 * Uso (desde la raíz del backend):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-horarios-fijos.ts
 *   npx ts-node -r tsconfig-paths/register scripts/seed-horarios-fijos.ts [ruta-datos.txt]
 *
 * Requisitos:
 *   - Archivo .env con DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME.
 *   - COMPANY_ID en .env o se usa el mismo GYM_ID que seed-alumnos (7623d786-...).
 *
 * Los datos por defecto se leen de scripts/datos-horarios-fijos.ts.
 * Si se pasa una ruta, debe ser un archivo con una línea por alumno:
 *   nombre completo<TAB>días (LUNES, MARTES, ...)<TAB>horario1<TAB>horario2...
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { Company } from '../src/entities/company.entity';
import {
  AthleteSchedule,
  ScheduleFrequency,
  ScheduleEndType,
  ScheduleStatus,
} from '../src/entities/athlete-schedule.entity';
import { LINEAS_HORARIOS_FIJOS } from './datos-horarios-fijos';

const entitiesPath = (path.join(__dirname, '..', 'src', 'entities') + '/*.entity.{ts,js}').replace(/\\/g, '/');

const GYM_ID = process.env.COMPANY_ID || '7623d786-23a5-447b-b970-bb58ee2a70ac';
const DURATION_HOURS = 1;

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  LUNES: 1,
  MARTES: 2,
  MIERCOLES: 3,
  JUEVES: 4,
  VIERNES: 5,
};

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [entitiesPath],
  synchronize: false,
  ssl: { rejectUnauthorized: false },
});

export interface ParsedRow {
  fullName: string;
  days: number[];
  times: string[];
}

function normalizeTime(t: string): string | null {
  const match = t.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const h = match[1].padStart(2, '0');
  const m = match[2].padStart(2, '0');
  return `${h}:${m}`;
}

function parseRow(line: string): ParsedRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('\t').map((p) => p.trim());
  const fullName = parts[0];
  if (!fullName) return null;

  let daysStr = parts[1] ?? '';
  const timeParts: string[] = parts.slice(2).map((p) => p.trim()).filter(Boolean);

  const timeAtEndOfDays = daysStr.match(/\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/);
  if (timeAtEndOfDays) {
    const timeStr = timeAtEndOfDays[1];
    daysStr = daysStr.slice(0, daysStr.length - timeStr.length).trim();
    const normalized = normalizeTime(timeStr);
    if (normalized) timeParts.unshift(normalized);
  }

  const dayNames = daysStr.split(',').map((d) => d.trim().toUpperCase()).filter(Boolean);
  const days = dayNames
    .map((d) => DAY_NAME_TO_NUMBER[d])
    .filter((n) => n !== undefined && !Number.isNaN(n));

  const times = timeParts
    .map((t) => normalizeTime(t))
    .filter((t): t is string => t !== null);

  if (days.length === 0 || times.length === 0) return null;

  return { fullName, days, times };
}

function distributeDaysToTimes(
  days: number[],
  times: string[],
): { days: number[]; time: string }[] {
  const uniqueTimes = [...new Set(times)];
  if (uniqueTimes.length === 1) {
    return [{ days: [...days].sort((a, b) => a - b), time: uniqueTimes[0] }];
  }
  const sortedDays = [...days].sort((a, b) => a - b);
  const k = uniqueTimes.length;
  const n = sortedDays.length;
  const chunkSize = Math.floor(n / k);
  const remainder = n % k;
  const result: { days: number[]; time: string }[] = [];
  let idx = 0;
  for (let i = 0; i < k; i++) {
    const size = chunkSize + (i < remainder ? 1 : 0);
    const group = sortedDays.slice(idx, idx + size);
    idx += size;
    if (group.length) result.push({ days: group, time: uniqueTimes[i] });
  }
  return result;
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + hours * 60;
  const nextH = Math.floor(totalMinutes / 60) % 24;
  const nextM = totalMinutes % 60;
  return `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
}

function normalizeFullName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function findUserByFullName(
  dataSource: DataSource,
  fullName: string,
): Promise<{ id: string } | null> {
  const normalized = normalizeFullName(fullName);
  const userRepo = dataSource.getRepository(User);

  if (!normalized.includes(' ')) {
    const byLastName = await userRepo
      .createQueryBuilder('u')
      .select('u.id')
      .where('LOWER(TRIM(u.lastName)) = :norm', { norm: normalized })
      .getRawOne();
    if (byLastName) return { id: byLastName.u_id };
    return null;
  }

  const byNameLastname = await userRepo
    .createQueryBuilder('u')
    .select('u.id')
    .where('LOWER(TRIM(CONCAT(u.name, \' \', u.lastName))) = :norm', { norm: normalized })
    .getRawOne();
  if (byNameLastname) return { id: byNameLastname.u_id };

  const byLastnameName = await userRepo
    .createQueryBuilder('u')
    .select('u.id')
    .where('LOWER(TRIM(CONCAT(u.lastName, \' \', u.name))) = :norm', { norm: normalized })
    .getRawOne();
  if (byLastnameName) return { id: byLastnameName.u_id };

  return null;
}

function parseArgs(): { dataPath: string | null } {
  const argv = process.argv.slice(2);
  const pathArg = argv.find((a) => !a.startsWith('--'));
  if (pathArg) return { dataPath: path.resolve(pathArg) };
  return { dataPath: null };
}

async function run() {
  const { dataPath } = parseArgs();

  let lines: string[];
  if (dataPath && fs.existsSync(dataPath)) {
    lines = fs.readFileSync(dataPath, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    console.log('Leyendo datos desde:', dataPath);
  } else {
    if (dataPath) console.warn('Archivo no encontrado, usando datos embebidos.');
    lines = LINEAS_HORARIOS_FIJOS;
  }

  console.log('Conectando a la base de datos...');
  await dataSource.initialize();

  const scheduleRepo = dataSource.getRepository(AthleteSchedule);
  const company = await dataSource.getRepository(Company).findOne({ where: { id: GYM_ID } });
  if (!company) {
    console.error('No se encontró el centro con ID:', GYM_ID);
    await dataSource.destroy();
    process.exit(1);
  }

  let inserted = 0;
  const failedNotFound: string[] = [];
  const failedErrors: string[] = [];
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  for (const line of lines) {
    const row = parseRow(line);
    if (!row) {
      console.warn('  Omitida (sin días u horarios válidos):', line.slice(0, 50) + '...');
      continue;
    }

    const user = await findUserByFullName(dataSource, row.fullName);
    if (!user) {
      console.warn('  Usuario no encontrado:', row.fullName);
      failedNotFound.push(row.fullName);
      continue;
    }

    const groups = distributeDaysToTimes(row.days, row.times);
    try {
      for (const { days: groupDays, time } of groups) {
        const startTime = time.length === 5 ? time : time.slice(0, 5);
        const endTime = addHours(startTime, DURATION_HOURS);
        const schedule = scheduleRepo.create({
          frequency: ScheduleFrequency.WEEKLY,
          daysOfWeek: groupDays.join(','),
          startTime,
          endTime,
          capacity: 1,
          startDate,
          endType: ScheduleEndType.NEVER,
          endDate: null,
          maxOccurrences: null,
          currentOccurrences: 0,
          status: ScheduleStatus.ACTIVE,
          notes: null,
          user: { id: user.id } as any,
          company: { id: GYM_ID } as any,
        });
        await scheduleRepo.save(schedule);
        inserted++;
      }
      console.log('  OK:', row.fullName, `(${groups.length} horario(s))`);
    } catch (e) {
      const msg = `${row.fullName}: ${(e as Error).message}`;
      failedErrors.push(msg);
      console.error('  Error:', msg);
    }
  }

  await dataSource.destroy();

  console.log('\n--- Resumen ---');
  console.log('Horarios insertados:', inserted);

  const totalFailed = failedNotFound.length + failedErrors.length;
  if (totalFailed > 0) {
    console.log('\n--- Alumnos que no se pudieron agregar ---');
    if (failedNotFound.length > 0) {
      console.log('\nUsuario no encontrado en la base de datos:');
      failedNotFound.forEach((nombre) => console.log('  -', nombre));
    }
    if (failedErrors.length > 0) {
      console.log('\nError al insertar horarios:');
      failedErrors.forEach((msg) => console.log('  -', msg));
    }
    console.log('\nTotal que fallaron:', totalFailed);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
