/**
 * Seed de jugadoras ATAH: crea cuentas ATHLETE, las vincula al centro y a la división.
 *
 * Email: apellido.nombre@atah.com (sin acentos/espacios; los entrenadores pueden cambiarlo después).
 * Contraseña temporal: EntrenamientoSTP1@ (mismo hash que seed-alumnos.ts)
 *
 * Uso (desde la raíz del backend, con .env cargado):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-atah-division.ts
 *   npx ts-node -r tsconfig-paths/register scripts/seed-atah-division.ts scripts/atah-jugadoras.json
 *   npx ts-node -r tsconfig-paths/register scripts/seed-atah-division.ts --offset 0 --limit 20
 *
 * Idempotente: si el email ya existe como atleta, asegura vínculo al centro + división.
 */

import 'dotenv/config';
import { DataSource, Repository } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { Company } from '../src/entities/company.entity';
import { Division } from '../src/entities/division.entity';
import { AthleteInvitation, InvitationStatus } from '../src/entities/athlete-invitation.entity';
import { UserRole } from '../src/common/enums/enums';
import * as path from 'path';
import * as fs from 'fs';

const entitiesPath = (path.join(__dirname, '..', 'src', 'entities') + '/*.entity.{ts,js}').replace(/\\/g, '/');

const COMPANY_ID = 'ea3a67be-d5f9-4f5e-b41b-ede061095b8a';
const DIVISION_ID = '2dbff042-a9a7-4458-a6ba-c62eca57e20e';

/** bcrypt de EntrenamientoSTP1@ (mismo que seed-alumnos.ts) */
const PASSWORD_HASH = '$2b$10$2kESj2Fk980RQ6C.YK410ey0I/0.hhmpB3xkCkyBJ8wYxVAmREl1m';

interface JugadoraRow {
  nombre: string;
  apellido: string;
  dni?: string;
  fechaNacimiento?: string;
  peso?: number;
  altura?: number;
}

function buildDataSource(): DataSource {
  const sslEnabled = String(process.env.DB_SSL ?? 'true').toLowerCase() !== 'false';
  const base = {
    type: 'postgres' as const,
    entities: [entitiesPath],
    synchronize: false,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return new DataSource({ ...base, url: databaseUrl });
  }
  return new DataSource({
    ...base,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

function slugPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function emailFrom(apellido: string, nombre: string): string {
  return `${slugPart(apellido)}.${slugPart(nombre)}@atah.com`;
}

function parseDate(fechaNacimiento?: string): Date | null {
  if (!fechaNacimiento?.trim()) return null;
  const d = new Date(`${fechaNacimiento.trim()}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseJugadoras(content: string): JugadoraRow[] {
  const data = JSON.parse(content);
  if (!Array.isArray(data)) {
    throw new Error('El archivo JSON debe ser un array de jugadoras');
  }
  return data.map((row: Record<string, unknown>, index: number) => {
    const nombre = String(row.nombre ?? row.name ?? '').trim();
    const apellido = String(row.apellido ?? row.lastName ?? '').trim();
    if (!nombre || !apellido) {
      throw new Error(`Fila ${index + 1} inválida: falta nombre o apellido. ${JSON.stringify(row)}`);
    }
    const dniRaw = row.dni != null ? String(row.dni).replace(/\D/g, '') : '';
    const fechaNacimiento = String(row.fechaNacimiento ?? row.fecha_nacimiento ?? row.dateOfBirth ?? '').trim();
    const peso = row.peso != null && row.peso !== '' ? Number(row.peso) : undefined;
    const altura = row.altura != null && row.altura !== '' ? Number(row.altura) : undefined;
    return {
      nombre,
      apellido,
      dni: dniRaw || undefined,
      fechaNacimiento: fechaNacimiento || undefined,
      peso: Number.isFinite(peso) ? peso : undefined,
      altura: Number.isFinite(altura) ? altura : undefined,
    };
  });
}

function parseArgs(): { dataPath: string; offset: number; limit: number } {
  const baseDir = path.resolve(__dirname, '..');
  const defaultPath = path.join(baseDir, 'scripts', 'atah-jugadoras.json');
  let dataPath = defaultPath;
  let offset = 0;
  let limit = 0;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--offset' && argv[i + 1] != null) {
      offset = Math.max(0, parseInt(argv[i + 1], 10) || 0);
      i++;
    } else if (argv[i] === '--limit' && argv[i + 1] != null) {
      limit = Math.max(1, parseInt(argv[i + 1], 10) || 0);
      i++;
    } else if (!argv[i].startsWith('--')) {
      dataPath = path.resolve(argv[i]);
    }
  }
  return { dataPath, offset, limit };
}

async function ensureCompanyLink(company: Company, user: User, companyRepo: Repository<Company>) {
  company.users = company.users || [];
  if (!company.users.some((u) => u.id === user.id)) {
    company.users.push(user);
    await companyRepo.save(company);
  }
}

async function run() {
  const { dataPath, offset, limit } = parseArgs();

  if (!fs.existsSync(dataPath)) {
    console.error('No se encontró el archivo de jugadoras:', dataPath);
    process.exit(1);
  }

  const content = fs.readFileSync(dataPath, 'utf-8');
  let jugadoras: JugadoraRow[];
  try {
    jugadoras = parseJugadoras(content);
  } catch (e) {
    console.error('Error al parsear JSON:', (e as Error).message);
    process.exit(1);
  }

  const totalEnArchivo = jugadoras.length;
  if (limit > 0) {
    jugadoras = jugadoras.slice(offset, offset + limit);
    console.log(
      `Procesando rango ${offset + 1}-${offset + jugadoras.length} de ${totalEnArchivo} (--offset ${offset} --limit ${limit}).`,
    );
  } else if (offset > 0) {
    jugadoras = jugadoras.slice(offset);
    console.log(`Procesando desde el ${offset + 1}º (${jugadoras.length} jugadoras).`);
  }

  if (jugadoras.length === 0) {
    console.log('No hay jugadoras que procesar en este rango.');
    process.exit(0);
  }

  const dataSource = buildDataSource();
  console.log('Conectando a la base de datos...');
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const companyRepo = dataSource.getRepository(Company);
  const divisionRepo = dataSource.getRepository(Division);
  const invitationRepo = dataSource.getRepository(AthleteInvitation);

  const company = await companyRepo.findOne({ where: { id: COMPANY_ID }, relations: ['users'] });
  if (!company) {
    console.error('No se encontró el centro con ID:', COMPANY_ID);
    await dataSource.destroy();
    process.exit(1);
  }

  const division = await divisionRepo.findOne({ where: { id: DIVISION_ID } });
  if (!division) {
    console.error('No se encontró la división con ID:', DIVISION_ID);
    await dataSource.destroy();
    process.exit(1);
  }
  if (division.companyId !== COMPANY_ID) {
    console.error(
      `La división ${DIVISION_ID} pertenece al centro ${division.companyId}, no a ${COMPANY_ID}.`,
    );
    await dataSource.destroy();
    process.exit(1);
  }

  console.log(`Centro: ${company.name ?? COMPANY_ID}`);
  console.log(`División: ${division.name ?? DIVISION_ID}`);
  console.log(`Jugadoras a procesar: ${jugadoras.length}\n`);

  let created = 0;
  let linked = 0;
  let updatedDivision = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const a of jugadoras) {
    const email = emailFrom(a.apellido, a.nombre);
    try {
      let user = await userRepo.findOne({ where: { email } });

      if (user) {
        if (user.role !== UserRole.ATHLETE) {
          errors.push(`${email}: ya existe con otro rol (${user.role}).`);
          skipped++;
          continue;
        }

        // Completar perfil si faltan datos
        let profileDirty = false;
        const dob = parseDate(a.fechaNacimiento);
        if (dob && !user.dateOfBirth) {
          user.dateOfBirth = dob;
          profileDirty = true;
        }
        if (a.peso != null && user.peso == null) {
          user.peso = a.peso;
          profileDirty = true;
        }
        if (a.altura != null && user.altura == null) {
          user.altura = a.altura;
          profileDirty = true;
        }
        if (a.dni && !user.biography) {
          user.biography = `DNI ${a.dni}`;
          profileDirty = true;
        }
        if (user.evaluationPortalOnly) {
          user.evaluationPortalOnly = false;
          profileDirty = true;
        }
        if (profileDirty) await userRepo.save(user);

        let invitation = await invitationRepo.findOne({
          where: {
            user: { id: user.id },
            company: { id: COMPANY_ID },
          },
        });

        if (!invitation) {
          invitation = invitationRepo.create({
            user,
            company: { id: COMPANY_ID },
            status: InvitationStatus.APPROVED,
            approvedAt: new Date(),
            isOnline: false,
            divisionId: DIVISION_ID,
          });
          await invitationRepo.save(invitation);
          await ensureCompanyLink(company, user, companyRepo);
          console.log(`  Vinculada al centro + división: ${email}`);
          linked++;
          continue;
        }

        let invDirty = false;
        if (invitation.status !== InvitationStatus.APPROVED) {
          invitation.status = InvitationStatus.APPROVED;
          invitation.approvedAt = new Date();
          invDirty = true;
        }
        if (invitation.divisionId !== DIVISION_ID) {
          invitation.divisionId = DIVISION_ID;
          invDirty = true;
          updatedDivision++;
        }
        if (invDirty) {
          await invitationRepo.save(invitation);
          console.log(`  Actualizada (división/estado): ${email}`);
        } else {
          console.log(`  Omitida (ya vinculada a la división): ${email}`);
          skipped++;
        }
        await ensureCompanyLink(company, user, companyRepo);
        continue;
      }

      const dateOfBirth = parseDate(a.fechaNacimiento) ?? undefined;
      user = userRepo.create({
        name: a.nombre,
        lastName: a.apellido,
        email,
        password: PASSWORD_HASH,
        role: UserRole.ATHLETE,
        isActive: true,
        activeToken: null,
        evaluationPortalOnly: false,
        dateOfBirth,
        peso: a.peso,
        altura: a.altura,
        biography: a.dni ? `DNI ${a.dni}` : undefined,
      });
      await userRepo.save(user);

      const invitation = invitationRepo.create({
        user,
        company: { id: COMPANY_ID },
        status: InvitationStatus.APPROVED,
        approvedAt: new Date(),
        isOnline: false,
        divisionId: DIVISION_ID,
      });
      await invitationRepo.save(invitation);
      await ensureCompanyLink(company, user, companyRepo);

      console.log(`  Creada: ${email} (${a.apellido}, ${a.nombre})`);
      created++;
    } catch (e) {
      const msg = `${email}: ${(e as Error).message}`;
      errors.push(msg);
      console.error('  Error:', msg);
    }
  }

  await dataSource.destroy();

  console.log('\n--- Resumen ---');
  console.log('Creadas:', created);
  console.log('Ya existían, vinculadas:', linked);
  console.log('División actualizada:', updatedDivision);
  console.log('Omitidas (ya OK):', skipped);
  if (errors.length > 0) {
    console.log('Errores:', errors.length);
    errors.forEach((e) => console.error('  -', e));
  }
  console.log('\nContraseña temporal de cuentas nuevas: EntrenamientoSTP1@');
  console.log('Los entrenadores pueden cambiar el email desde el perfil de cada atleta.');

  const siguienteOffset = offset + (limit > 0 ? limit : totalEnArchivo);
  if (limit > 0 && siguienteOffset < totalEnArchivo) {
    console.log('\nSiguiente tanda:');
    console.log(
      `  npx ts-node -r tsconfig-paths/register scripts/seed-atah-division.ts --offset ${siguienteOffset} --limit ${limit}`,
    );
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
