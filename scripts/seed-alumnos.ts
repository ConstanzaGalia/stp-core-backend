/**
 * Script para agregar alumnos a la base de datos: crea la cuenta (con contraseña genérica),
 * marca el correo como verificado y vincula al gym indicado.
 *
 * Uso (desde la raíz del backend):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-alumnos.ts [ruta-alumnos.json]
 *   npx ts-node -r tsconfig-paths/register scripts/seed-alumnos.ts alumnos.json --offset 0 --limit 50
 *
 * Opciones (para evitar timeout de 60s en Vercel u otros entornos):
 *   --offset N   omitir los primeros N alumnos
 *   --limit N    procesar solo N alumnos por ejecución
 *
 * Por defecto lee scripts/alumnos.json. Con --limit, al terminar indica el comando para la siguiente tanda.
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { Company } from '../src/entities/company.entity';
import { AthleteInvitation, InvitationStatus } from '../src/entities/athlete-invitation.entity';
import { UserRole } from '../src/common/enums/enums';
import * as path from 'path';
import * as fs from 'fs';

// Cargar todas las entidades para que TypeORM resuelva las relaciones (Company#payments, etc.)
const entitiesPath = (path.join(__dirname, '..', 'src', 'entities') + '/*.entity.{ts,js}').replace(/\\/g, '/');

const GYM_ID = '7623d786-23a5-447b-b970-bb58ee2a70ac';

// Contraseña genérica ya hasheada (bcrypt)
const PASSWORD_HASH = '$2b$10$2kESj2Fk980RQ6C.YK410ey0I/0.hhmpB3xkCkyBJ8wYxVAmREl1m';

interface AlumnoRow {
  nombre: string;
  apellido: string;
  telefono: string;
  mail: string;
  fechaNacimiento: string; // YYYY-MM-DD
}

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

function parseAlumnos(content: string): AlumnoRow[] {
  const data = JSON.parse(content);
  if (!Array.isArray(data)) {
    throw new Error('El archivo JSON debe ser un array de alumnos');
  }
  return data.map((row: Record<string, unknown>) => {
    const nombre = String(row.nombre ?? row.name ?? '').trim();
    const apellido = String(row.apellido ?? row.lastName ?? '').trim();
    const telefono = String(row.telefono ?? row.phone ?? '').trim();
    const mail = String(row.mail ?? row.email ?? '').trim();
    const fechaNacimiento = String(row.fechaNacimiento ?? row.fecha_nacimiento ?? row.dateOfBirth ?? '').trim();
    if (!nombre || !apellido || !mail) {
      throw new Error(`Fila inválida: debe tener nombre, apellido y mail. Recibido: ${JSON.stringify(row)}`);
    }
    return { nombre, apellido, telefono, mail, fechaNacimiento };
  });
}

function parsePhone(telefono: string): number | null {
  const digits = telefono.replace(/\D/g, '');
  if (digits.length === 0) return null;
  const n = parseInt(digits, 10);
  return Number.isSafeInteger(n) ? n : null;
}

function parseDate(fechaNacimiento: string): Date | null {
  if (!fechaNacimiento) return null;
  const d = new Date(fechaNacimiento);
  return isNaN(d.getTime()) ? null : d;
}

function parseArgs(): { dataPath: string; offset: number; limit: number } {
  const baseDir = path.resolve(__dirname, '..');
  const defaultPath = path.join(baseDir, 'scripts', 'alumnos.json');
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

async function run() {
  const { dataPath, offset, limit } = parseArgs();

  if (!fs.existsSync(dataPath)) {
    console.error('No se encontró el archivo de alumnos:', dataPath);
    console.error('Crea scripts/alumnos.json con un array de objetos: nombre, apellido, telefono, mail, fechaNacimiento');
    process.exit(1);
  }

  const content = fs.readFileSync(dataPath, 'utf-8');
  let alumnos: AlumnoRow[];
  try {
    alumnos = parseAlumnos(content);
  } catch (e) {
    console.error('Error al parsear JSON:', (e as Error).message);
    process.exit(1);
  }

  const totalEnArchivo = alumnos.length;
  if (limit > 0) {
    alumnos = alumnos.slice(offset, offset + limit);
    console.log(`Procesando rango ${offset + 1}-${offset + alumnos.length} de ${totalEnArchivo} (--offset ${offset} --limit ${limit}).`);
  } else if (offset > 0) {
    alumnos = alumnos.slice(offset);
    console.log(`Procesando desde el ${offset + 1}º hasta el final (${alumnos.length} alumnos, --offset ${offset}).`);
  }

  if (alumnos.length === 0) {
    console.log('No hay alumnos que procesar en este rango.');
    process.exit(0);
  }

  console.log('Conectando a la base de datos...');
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const companyRepo = dataSource.getRepository(Company);
  const invitationRepo = dataSource.getRepository(AthleteInvitation);

  const company = await companyRepo.findOne({ where: { id: GYM_ID }, relations: ['users'] });
  if (!company) {
    console.error('No se encontró el gym con ID:', GYM_ID);
    await dataSource.destroy();
    process.exit(1);
  }

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let errors: string[] = [];

  for (const a of alumnos) {
    try {
      const email = a.mail.toLowerCase();
      let user = await userRepo.findOne({ where: { email } });

      if (user) {
        if (user.role !== UserRole.ATHLETE) {
          errors.push(`${email}: ya existe con otro rol (${user.role}).`);
          skipped++;
          continue;
        }
        const existingInv = await invitationRepo.findOne({
          where: {
            user: { id: user.id },
            company: { id: GYM_ID },
            status: InvitationStatus.APPROVED,
          },
        });
        if (existingInv) {
          console.log(`  Omitido (ya vinculado): ${email}`);
          skipped++;
          continue;
        }
        // Vincular al gym
        const invitation = invitationRepo.create({
          user,
          company: { id: GYM_ID },
          status: InvitationStatus.APPROVED,
          approvedAt: new Date(),
          isOnline: false,
        });
        await invitationRepo.save(invitation);
        company.users = company.users || [];
        if (!company.users.some((u) => u.id === user!.id)) {
          company.users.push(user);
          await companyRepo.save(company);
        }
        console.log(`  Vinculado al gym (ya existía): ${email}`);
        linked++;
        continue;
      }

      const phoneNumber = parsePhone(a.telefono) ?? undefined;
      const dateOfBirth = parseDate(a.fechaNacimiento) ?? undefined;

      user = userRepo.create({
        name: a.nombre,
        lastName: a.apellido,
        email,
        password: PASSWORD_HASH,
        role: UserRole.ATHLETE,
        phoneNumber: phoneNumber ?? undefined,
        dateOfBirth,
        isActive: true,
        activeToken: null,
      });
      await userRepo.save(user);

      const invitation = invitationRepo.create({
        user,
        company: { id: GYM_ID },
        status: InvitationStatus.APPROVED,
        approvedAt: new Date(),
        isOnline: false,
      });
      await invitationRepo.save(invitation);

      company.users = company.users || [];
      if (!company.users.some((u) => u.id === user!.id)) {
        company.users.push(user);
        await companyRepo.save(company);
      }

      console.log(`  Creado y vinculado: ${email}`);
      created++;
    } catch (e) {
      const msg = `${a.mail}: ${(e as Error).message}`;
      errors.push(msg);
      console.error('  Error:', msg);
    }
  }

  await dataSource.destroy();

  console.log('\n--- Resumen ---');
  console.log('Creados y vinculados:', created);
  console.log('Ya existían, vinculados al gym:', linked);
  console.log('Omitidos:', skipped);
  if (errors.length > 0) {
    console.log('Errores:', errors.length);
    errors.forEach((e) => console.error('  -', e));
  }

  const siguienteOffset = offset + (limit > 0 ? limit : totalEnArchivo);
  if (limit > 0 && siguienteOffset < totalEnArchivo) {
    const archivoArg = dataPath !== path.join(path.resolve(__dirname, '..'), 'scripts', 'alumnos.json') ? dataPath : '';
    console.log('\nPara procesar la siguiente tanda (evitar timeout):');
    console.log(`  npx ts-node -r tsconfig-paths/register scripts/seed-alumnos.ts ${archivoArg} --offset ${siguienteOffset} --limit ${limit}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
