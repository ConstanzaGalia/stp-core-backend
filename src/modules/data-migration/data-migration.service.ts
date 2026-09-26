import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/entities/company.entity';
import { User } from 'src/entities/user.entity';
import {
  AthleteSchedule,
  ScheduleStatus,
} from 'src/entities/athlete-schedule.entity';
import {
  AthleteInvitation,
  InvitationStatus,
} from 'src/entities/athlete-invitation.entity';
import { UserRole } from 'src/common/enums/enums';
import { CompanyService } from '../company/company.service';
import { AthletesService } from '../athletes/athletes.service';
import { ReservationsService } from '../reservation/reservation.service';
import {
  MigrateAthleteRowDto,
  MigrateAthletesConfirmDto,
  MigrateAthletesPreviewDto,
} from './dto/migrate-athletes.dto';
import {
  MigrateScheduleRowDto,
  MigrateSchedulesConfirmDto,
  MigrateSchedulesPreviewDto,
} from './dto/migrate-schedules.dto';

export type AthleteMigrationAction =
  | 'create'
  | 'link'
  | 'already_member'
  | 'skip'
  | 'error';

export type ScheduleMigrationAction = 'create' | 'skip' | 'error';

export type AthleteMigrationPreviewRow = {
  rowNumber: number | null;
  email: string;
  name: string;
  lastName: string;
  action: AthleteMigrationAction;
  included: boolean;
  message: string | null;
  existingUserId: string | null;
};

export type ScheduleMigrationPreviewRow = {
  rowNumber: number | null;
  email: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  action: ScheduleMigrationAction;
  included: boolean;
  message: string | null;
  athleteId: string | null;
  athleteName: string | null;
};

@Injectable()
export class DataMigrationService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly athletesService: AthletesService,
    private readonly reservationsService: ReservationsService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepository: Repository<AthleteInvitation>,
    @InjectRepository(AthleteSchedule)
    private readonly scheduleRepository: Repository<AthleteSchedule>,
  ) {}

  async assertOperator(user: User): Promise<void> {
    await this.companyService.assertCanManagePlatformCompanies(user);
  }

  private async assertCompanyExists(companyId: string): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Centro no encontrado');
    }
    return company;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private parseOptionalNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }

  private sanitizeAthleteRow(row: MigrateAthleteRowDto): {
    ok: true;
    data: {
      email: string;
      name: string;
      lastName: string;
      phoneNumber?: string;
      dni?: string;
      dateOfBirth?: string;
      sexo?: 'femenino' | 'masculino';
      peso?: number;
      altura?: number;
      rowNumber?: number;
    };
  } | { ok: false; message: string } {
    const email = this.normalizeEmail(row.email ?? '');
    const name = String(row.name ?? '').trim();
    const lastName = String(row.lastName ?? '').trim();

    if (!email || !this.isValidEmail(email)) {
      return { ok: false, message: 'Email inválido' };
    }
    if (!name || !lastName) {
      return { ok: false, message: 'Nombre y apellido son obligatorios' };
    }

    const dateOfBirth = row.dateOfBirth?.trim() || undefined;
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return { ok: false, message: 'fecha_nacimiento debe ser YYYY-MM-DD' };
    }

    const sexoRaw = row.sexo != null ? String(row.sexo).trim().toLowerCase() : '';
    let sexo: 'femenino' | 'masculino' | undefined;
    if (sexoRaw) {
      if (sexoRaw !== 'femenino' && sexoRaw !== 'masculino') {
        return { ok: false, message: 'sexo debe ser femenino o masculino' };
      }
      sexo = sexoRaw;
    }

    const peso = this.parseOptionalNumber(row.peso);
    if (peso != null && (Number.isNaN(peso) || peso < 20 || peso > 250)) {
      return { ok: false, message: 'peso_kg inválido (20–250)' };
    }
    const altura = this.parseOptionalNumber(row.altura);
    if (altura != null && (Number.isNaN(altura) || altura < 100 || altura > 250)) {
      return { ok: false, message: 'altura_cm inválida (100–250)' };
    }

    return {
      ok: true,
      data: {
        email,
        name,
        lastName,
        phoneNumber: row.phoneNumber?.trim() || undefined,
        dni: row.dni?.trim() || undefined,
        dateOfBirth,
        sexo,
        peso: peso ?? undefined,
        altura: altura ?? undefined,
        rowNumber: row.rowNumber,
      },
    };
  }

  private normalizeTime(time: string): string {
    const match = String(time).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      throw new BadRequestException(`Hora inválida: ${time}`);
    }
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  private daysKey(days: number[]): string {
    return [...new Set(days.map(Number))]
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)
      .sort((a, b) => a - b)
      .join(',');
  }

  private timeKey(time: string): string {
    return this.normalizeTime(time).slice(0, 5);
  }

  async previewAthletes(
    actor: User,
    companyId: string,
    dto: MigrateAthletesPreviewDto,
  ): Promise<{
    companyId: string;
    companyName: string;
    summary: Record<string, number>;
    rows: AthleteMigrationPreviewRow[];
  }> {
    await this.assertOperator(actor);
    const company = await this.assertCompanyExists(companyId);

    const emails = dto.rows.map((r) => this.normalizeEmail(r.email));
    const existingUsers = emails.length
      ? await this.userRepository
          .createQueryBuilder('u')
          .where('LOWER(u.email) IN (:...emails)', { emails })
          .getMany()
      : [];
    const userByEmail = new Map(
      existingUsers.map((u) => [this.normalizeEmail(u.email), u]),
    );

    const invitations = await this.invitationRepository.find({
      where: { company: { id: companyId } },
      relations: ['user'],
    });
    const invitationByUserId = new Map(
      invitations
        .filter((inv) => inv.user?.id)
        .map((inv) => [inv.user.id, inv] as const),
    );

    const seenEmails = new Set<string>();
    const rows: AthleteMigrationPreviewRow[] = dto.rows.map((row) => {
      const sanitized = this.sanitizeAthleteRow(row);
      const rowNumber = row.rowNumber ?? null;
      if (sanitized.ok === false) {
        return {
          rowNumber,
          email: this.normalizeEmail(row.email ?? ''),
          name: String(row.name ?? '').trim(),
          lastName: String(row.lastName ?? '').trim(),
          existingUserId: null,
          action: 'error' as const,
          included: false,
          message: sanitized.message,
        };
      }

      const { email, name, lastName } = sanitized.data;
      const base = {
        rowNumber,
        email,
        name,
        lastName,
        existingUserId: null as string | null,
      };

      if (seenEmails.has(email)) {
        return {
          ...base,
          action: 'skip' as const,
          included: false,
          message: 'Email duplicado en el archivo',
        };
      }
      seenEmails.add(email);

      const existing = userByEmail.get(email);
      if (!existing) {
        return {
          ...base,
          action: 'create' as const,
          included: true,
          message: 'Se creará el alumno',
        };
      }

      base.existingUserId = existing.id;
      if (existing.role !== UserRole.ATHLETE) {
        return {
          ...base,
          action: 'error' as const,
          included: false,
          message: `El email ya existe con rol ${existing.role}`,
        };
      }

      const invitation = invitationByUserId.get(existing.id);
      if (invitation?.status === InvitationStatus.APPROVED) {
        return {
          ...base,
          action: 'already_member' as const,
          included: false,
          message: 'Ya está vinculado al centro',
        };
      }
      if (invitation?.status === InvitationStatus.PENDING) {
        return {
          ...base,
          action: 'error' as const,
          included: false,
          message: 'Tiene una solicitud pendiente en el centro',
        };
      }

      return {
        ...base,
        action: 'link' as const,
        included: true,
        message: 'Usuario existente: se vinculará y se le pondrá la contraseña del centro',
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc[row.action] = (acc[row.action] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      companyId: company.id,
      companyName: company.name,
      summary,
      rows,
    };
  }

  async confirmAthletes(
    actor: User,
    companyId: string,
    dto: MigrateAthletesConfirmDto,
  ): Promise<{
    companyId: string;
    created: number;
    linked: number;
    updated: number;
    skipped: number;
    errors: Array<{ email: string; message: string }>;
    temporaryPasswords: Array<{ email: string; temporaryPassword: string }>;
  }> {
    await this.assertOperator(actor);
    await this.assertCompanyExists(companyId);

    const preview = await this.previewAthletes(actor, companyId, { rows: dto.rows });
    const previewByEmail = new Map(preview.rows.map((r) => [r.email, r]));

    let created = 0;
    let linked = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ email: string; message: string }> = [];
    const temporaryPasswords: Array<{ email: string; temporaryPassword: string }> = [];

    for (const row of dto.rows) {
      const sanitized = this.sanitizeAthleteRow(row);
      if (sanitized.ok === false) {
        errors.push({
          email: this.normalizeEmail(row.email ?? ''),
          message: sanitized.message,
        });
        continue;
      }

      const data = sanitized.data;
      const previewRow = previewByEmail.get(data.email);
      if (!previewRow) {
        skipped += 1;
        continue;
      }

      if (previewRow.action === 'already_member') {
        if (dto.updateExisting && previewRow.existingUserId) {
          try {
            await this.patchAthleteProfile(previewRow.existingUserId, {
              ...row,
              ...data,
            });
            updated += 1;
          } catch (e: unknown) {
            errors.push({
              email: data.email,
              message: e instanceof Error ? e.message : 'Error al actualizar perfil',
            });
          }
        } else {
          skipped += 1;
        }
        continue;
      }

      if (previewRow.action === 'error' || previewRow.action === 'skip') {
        if (previewRow.action === 'error') {
          errors.push({ email: data.email, message: previewRow.message ?? 'Fila inválida' });
        } else {
          skipped += 1;
        }
        continue;
      }

      try {
        const result = await this.athletesService.createAthleteForCompany(companyId, {
          name: data.name,
          lastName: data.lastName,
          email: data.email,
          phoneNumber: data.phoneNumber,
          dni: data.dni,
          dateOfBirth: data.dateOfBirth,
          sexo: data.sexo,
          peso: data.peso,
          altura: data.altura,
          isOnline: false,
        });
        if (result.temporaryPassword) {
          temporaryPasswords.push({
            email: data.email,
            temporaryPassword: result.temporaryPassword,
          });
        }
        if (result.linked || previewRow.action === 'link') {
          linked += 1;
        } else {
          created += 1;
        }
      } catch (e: unknown) {
        errors.push({
          email: data.email,
          message: e instanceof Error ? e.message : 'Error al crear/vincular',
        });
      }
    }

    return {
      companyId,
      created,
      linked,
      updated,
      skipped,
      errors,
      temporaryPasswords,
    };
  }

  private async patchAthleteProfile(userId: string, row: MigrateAthleteRowDto): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;

    let touched = false;
    if (row.name?.trim()) {
      user.name = row.name.trim();
      touched = true;
    }
    if (row.lastName?.trim()) {
      user.lastName = row.lastName.trim();
      touched = true;
    }
    if (row.dni?.trim()) {
      user.dni = row.dni.trim();
      touched = true;
    }
    if (row.dateOfBirth) {
      user.dateOfBirth = new Date(row.dateOfBirth);
      touched = true;
    }
    if (row.phoneNumber) {
      const digits = String(row.phoneNumber).replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!Number.isNaN(num)) {
        user.phoneNumber = num;
        touched = true;
      }
    }
    if (row.sexo === 'femenino' || row.sexo === 'masculino') {
      user.sexo = row.sexo;
      touched = true;
    }
    if (row.peso != null && Number.isFinite(Number(row.peso))) {
      user.peso = Number(row.peso);
      touched = true;
    }
    if (row.altura != null && Number.isFinite(Number(row.altura))) {
      user.altura = Number(row.altura);
      touched = true;
    }
    if (touched) {
      await this.userRepository.save(user);
    }
  }

  async previewSchedules(
    actor: User,
    companyId: string,
    dto: MigrateSchedulesPreviewDto,
  ): Promise<{
    companyId: string;
    companyName: string;
    summary: Record<string, number>;
    rows: ScheduleMigrationPreviewRow[];
  }> {
    await this.assertOperator(actor);
    const company = await this.assertCompanyExists(companyId);

    const invitations = await this.invitationRepository.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.APPROVED,
      },
      relations: ['user'],
    });
    const athleteByEmail = new Map(
      invitations
        .filter((inv) => inv.user?.email)
        .map((inv) => [this.normalizeEmail(inv.user.email), inv.user] as const),
    );

    const existingSchedules = await this.scheduleRepository.find({
      where: { company: { id: companyId }, status: ScheduleStatus.ACTIVE },
      relations: ['user'],
    });
    const scheduleKeys = new Set(
      existingSchedules
        .filter((s) => s.user?.id)
        .map((s) => {
          const days =
            typeof s.daysOfWeek === 'string'
              ? s.daysOfWeek.split(',').map(Number)
              : Array.isArray(s.daysOfWeek)
                ? (s.daysOfWeek as unknown as number[]).map(Number)
                : [];
          return `${s.user.id}|${this.daysKey(days)}|${this.timeKey(String(s.startTime))}|${this.timeKey(String(s.endTime))}`;
        }),
    );

    const seenKeys = new Set<string>();
    const rows: ScheduleMigrationPreviewRow[] = dto.rows.map((row) => {
      const email = this.normalizeEmail(row.email);
      const rowNumber = row.rowNumber ?? null;
      let startTime: string;
      let endTime: string;
      try {
        startTime = this.normalizeTime(row.startTime);
        endTime = this.normalizeTime(row.endTime);
      } catch {
        return {
          rowNumber,
          email,
          daysOfWeek: row.daysOfWeek ?? [],
          startTime: row.startTime,
          endTime: row.endTime,
          action: 'error' as const,
          included: false,
          message: 'Hora inválida (usar HH:mm)',
          athleteId: null,
          athleteName: null,
        };
      }

      const days = [...new Set((row.daysOfWeek ?? []).map(Number))]
        .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)
        .sort((a, b) => a - b);

      const base = {
        rowNumber,
        email,
        daysOfWeek: days,
        startTime,
        endTime,
        athleteId: null as string | null,
        athleteName: null as string | null,
      };

      if (!days.length) {
        return {
          ...base,
          action: 'error' as const,
          included: false,
          message: 'Sin días válidos',
        };
      }
      if (startTime >= endTime) {
        return {
          ...base,
          action: 'error' as const,
          included: false,
          message: 'hora_inicio debe ser anterior a hora_fin',
        };
      }

      const athlete = athleteByEmail.get(email);
      if (!athlete) {
        return {
          ...base,
          action: 'error' as const,
          included: false,
          message: 'Alumno no encontrado en el centro (migrá perfiles primero)',
        };
      }

      base.athleteId = athlete.id;
      base.athleteName = `${athlete.name} ${athlete.lastName}`.trim();

      const key = `${athlete.id}|${this.daysKey(days)}|${startTime}|${endTime}`;
      if (seenKeys.has(key)) {
        return {
          ...base,
          action: 'skip' as const,
          included: false,
          message: 'Duplicado en el archivo',
        };
      }
      seenKeys.add(key);

      if (scheduleKeys.has(key)) {
        return {
          ...base,
          action: 'skip' as const,
          included: false,
          message: 'Ya existe un horario idéntico',
        };
      }

      return {
        ...base,
        action: 'create' as const,
        included: true,
        message: 'Se creará el horario fijo',
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc[row.action] = (acc[row.action] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      companyId: company.id,
      companyName: company.name,
      summary,
      rows,
    };
  }

  async confirmSchedules(
    actor: User,
    companyId: string,
    dto: MigrateSchedulesConfirmDto,
  ): Promise<{
    companyId: string;
    created: number;
    skipped: number;
    errors: Array<{ email: string; message: string }>;
  }> {
    await this.assertOperator(actor);
    await this.assertCompanyExists(companyId);

    const preview = await this.previewSchedules(actor, companyId, { rows: dto.rows });
    const creatable = preview.rows.filter((r) => r.action === 'create' && r.athleteId);

    let created = 0;
    let skipped = preview.rows.length - creatable.length;
    const errors: Array<{ email: string; message: string }> = [];

    for (const row of creatable) {
      try {
        await this.reservationsService.createRecurringReservation(row.athleteId!, {
          daysOfWeek: row.daysOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          companyId,
        });
        created += 1;
      } catch (e: unknown) {
        errors.push({
          email: row.email,
          message: e instanceof Error ? e.message : 'Error al crear horario',
        });
      }
    }

    return { companyId, created, skipped, errors };
  }
}
