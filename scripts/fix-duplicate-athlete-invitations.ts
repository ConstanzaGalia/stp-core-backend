/**
 * Script para diagnosticar y corregir invitaciones duplicadas de atletas
 * 
 * Uso:
 *   npx ts-node scripts/fix-duplicate-athlete-invitations.ts <email> [--fix] [--keep-company=<companyName>]
 * 
 * Ejemplos:
 *   # Solo diagnóstico (no hace cambios):
 *   npx ts-node scripts/fix-duplicate-athlete-invitations.ts vickyarmayor@hotmail.com
 * 
 *   # Corregir manteniendo solo la invitación en "sdt":
 *   npx ts-node scripts/fix-duplicate-athlete-invitations.ts vickyarmayor@hotmail.com --fix --keep-company="sdt"
 */

import { DataSource } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { AthleteInvitation, InvitationStatus } from '../src/entities/athlete-invitation.entity';
import { Company } from '../src/entities/company.entity';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Uso: npx ts-node scripts/fix-duplicate-athlete-invitations.ts <email> [--fix] [--keep-company=<companyName>]

Opciones:
  <email>                       Email del atleta a diagnosticar (requerido)
  --fix                         Aplicar correcciones (sin esto, solo muestra información)
  --keep-company=<companyName>  Nombre del centro donde mantener la invitación activa

Ejemplos:
  # Solo diagnóstico:
  npx ts-node scripts/fix-duplicate-athlete-invitations.ts vickyarmayor@hotmail.com

  # Corregir manteniendo solo "sdt":
  npx ts-node scripts/fix-duplicate-athlete-invitations.ts vickyarmayor@hotmail.com --fix --keep-company="sdt"
    `);
    process.exit(0);
  }

  const email = args[0];
  const shouldFix = args.includes('--fix');
  const keepCompanyArg = args.find(arg => arg.startsWith('--keep-company='));
  const keepCompanyName = keepCompanyArg ? keepCompanyArg.split('=')[1]?.replace(/["']/g, '') : null;

  if (!email || !email.includes('@')) {
    console.error('❌ Error: Debes proporcionar un email válido');
    process.exit(1);
  }

  if (shouldFix && !keepCompanyName) {
    console.error('❌ Error: Para usar --fix debes especificar --keep-company=<nombre>');
    process.exit(1);
  }

  // Crear conexión a la base de datos usando el data-source existente
  const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'stp_core',
    entities: [User, AthleteInvitation, Company],
    synchronize: false,
  });

  try {
    console.log('🔌 Conectando a la base de datos...');
    await AppDataSource.initialize();
    console.log('✅ Conectado\n');

    const userRepository = AppDataSource.getRepository(User);
    const invitationRepository = AppDataSource.getRepository(AthleteInvitation);
    const companyRepository = AppDataSource.getRepository(Company);

    // Buscar usuario
    console.log(`🔍 Buscando atleta con email: ${email}`);
    const user = await userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: email.toLowerCase() })
      .getOne();

    if (!user) {
      console.error(`❌ No se encontró un usuario con el email: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Usuario encontrado:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Nombre: ${user.name} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Rol: ${user.role}\n`);

    // Buscar invitaciones
    console.log('🔍 Buscando invitaciones...');
    const invitations = await invitationRepository.find({
      where: { user: { id: user.id } },
      relations: ['company'],
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });

    if (invitations.length === 0) {
      console.log('ℹ️  No se encontraron invitaciones para este atleta');
      process.exit(0);
    }

    console.log(`\n📋 Invitaciones encontradas (${invitations.length}):\n`);
    
    const approvedInvitations = invitations.filter(
      inv => inv.status === InvitationStatus.APPROVED
    );

    invitations.forEach((inv, index) => {
      const statusEmoji = inv.status === InvitationStatus.APPROVED ? '✅' : 
                         inv.status === InvitationStatus.LEFT ? '👋' :
                         inv.status === InvitationStatus.PENDING ? '⏳' : '❌';
      
      console.log(`${index + 1}. ${statusEmoji} ${inv.status.toUpperCase()}`);
      console.log(`   Centro: ${inv.company?.name || 'N/A'} (${inv.company?.id || 'N/A'})`);
      console.log(`   Invitación ID: ${inv.id}`);
      console.log(`   Creada: ${inv.createdAt}`);
      console.log(`   Actualizada: ${inv.updatedAt}`);
      if (inv.approvedAt) console.log(`   Aprobada: ${inv.approvedAt}`);
      if (inv.leftAt) console.log(`   Salida: ${inv.leftAt}`);
      console.log('');
    });

    // Verificar si hay problema
    if (approvedInvitations.length <= 1) {
      console.log('✅ No hay problema: El atleta tiene máximo 1 invitación aprobada');
      process.exit(0);
    }

    console.log(`⚠️  PROBLEMA DETECTADO: El atleta tiene ${approvedInvitations.length} invitaciones APROBADAS simultáneas`);
    console.log('   Debería tener solo 1 invitación aprobada a la vez\n');

    if (!shouldFix) {
      console.log('ℹ️  Para corregir este problema, ejecuta el script con --fix --keep-company="nombre_del_centro"');
      console.log('\nEjemplo:');
      console.log(`   npx ts-node scripts/fix-duplicate-athlete-invitations.ts ${email} --fix --keep-company="${approvedInvitations[0].company?.name}"\n`);
      process.exit(0);
    }

    // MODO FIX: Aplicar correcciones
    console.log(`\n🔧 MODO CORRECCIÓN ACTIVADO`);
    console.log(`   Se mantendrá la invitación en: ${keepCompanyName}`);
    console.log(`   Las demás se marcarán como LEFT\n`);

    // Buscar el centro a mantener
    const keepInvitation = approvedInvitations.find(
      inv => inv.company?.name.toLowerCase() === keepCompanyName.toLowerCase()
    );

    if (!keepInvitation) {
      console.error(`❌ Error: No se encontró una invitación aprobada en el centro "${keepCompanyName}"`);
      console.log('\nCentros disponibles con invitación aprobada:');
      approvedInvitations.forEach(inv => {
        console.log(`   - ${inv.company?.name}`);
      });
      process.exit(1);
    }

    console.log(`✅ Invitación a mantener:`);
    console.log(`   Centro: ${keepInvitation.company?.name}`);
    console.log(`   ID: ${keepInvitation.id}\n`);

    const toUpdate = approvedInvitations.filter(inv => inv.id !== keepInvitation.id);
    
    console.log(`🔄 Se marcarán ${toUpdate.length} invitación(es) como LEFT:\n`);

    for (const inv of toUpdate) {
      console.log(`   📝 Procesando: ${inv.company?.name}`);
      inv.status = InvitationStatus.LEFT;
      inv.leftAt = new Date();
      await invitationRepository.save(inv);

      // Remover de la relación many-to-many
      if (inv.company?.id) {
        const company = await companyRepository.findOne({
          where: { id: inv.company.id },
          relations: ['users'],
        });
        if (company) {
          company.users = company.users.filter(u => u.id !== user.id);
          await companyRepository.save(company);
          console.log(`      ✅ Removido de la tabla company_users`);
        }
      }
      
      console.log(`      ✅ Invitación marcada como LEFT\n`);
    }

    console.log(`\n✅ CORRECCIÓN COMPLETADA`);
    console.log(`   ${user.name} ${user.lastName} ahora solo está activo en: ${keepInvitation.company?.name}`);
    console.log(`   ${toUpdate.length} invitación(es) fueron marcadas como LEFT\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main();
