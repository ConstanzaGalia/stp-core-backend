import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { ScheduleConfig } from '../../entities/schedule-config.entity';
import { ScheduleException } from '../../entities/schedule-exception.entity';
import {
  StaffCompensationProfile,
  StaffPayType,
} from '../../entities/staff-compensation-profile.entity';
import { StaffShiftAssignment } from '../../entities/staff-shift-assignment.entity';
import { StaffShiftClosure } from '../../entities/staff-shift-closure.entity';
import { StaffWeekNote } from '../../entities/staff-week-note.entity';
import { UserRole } from '../../common/enums/enums';
import {
  UpsertWeekAssignmentsDto,
  UpdateCompensationBatchDto,
} from './dto/staff-scheduling.dto';
import {
  addDays,
  cellKey,
  DEFAULT_STAFF_COLORS,
  formatDayLabel,
  formatStaffDisplayNameFromParts,
  generateStaffGridSlots,
  generateSlotsForConfig,
  getWeekDates,
  getWeekStartMonday,
  parseCalendarDate,
  SlotRow,
  toCalendarDateString,
} from './staff-scheduling.utils';

const SCHEDULING_STAFF_ROLES = [
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
  UserRole.DIRECTOR,
];

const MANAGE_ROLES = [
  UserRole.DIRECTOR,
  UserRole.SECRETARIA,
  UserRole.STP_ADMIN,
];

@Injectable()
export class StaffSchedulingService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ScheduleConfig)
    private readonly scheduleConfigRepository: Repository<ScheduleConfig>,
    @InjectRepository(ScheduleException)
    private readonly scheduleExceptionRepository: Repository<ScheduleException>,
    @InjectRepository(StaffCompensationProfile)
    private readonly compensationRepository: Repository<StaffCompensationProfile>,
    @InjectRepository(StaffShiftAssignment)
    private readonly assignmentRepository: Repository<StaffShiftAssignment>,
    @InjectRepository(StaffShiftClosure)
    private readonly closureRepository: Repository<StaffShiftClosure>,
    @InjectRepository(StaffWeekNote)
    private readonly weekNoteRepository: Repository<StaffWeekNote>,
  ) {}

  private async assertCompanyAccess(user: User, companyId: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) {
      throw new NotFoundException('Centro no encontrado');
    }
    if (user.role === UserRole.STP_ADMIN) {
      return company;
    }
    const isMember = (company.users ?? []).some((u) => u.id === user.id);
    if (!isMember || !MANAGE_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tenés permiso para gestionar horarios del staff');
    }
    return company;
  }

  /** Staff que puede cubrir turnos: roles operativos + cualquiera con perfil de compensación (ej. sueldo fijo). */
  private getSchedulableStaff(
    company: Company,
    compensationUserIds: Iterable<string> = [],
  ): User[] {
    const profileIds = new Set(compensationUserIds);
    const byId = new Map<string, User>();
    for (const u of company.users ?? []) {
      if (u.isActive === false) continue;
      if (SCHEDULING_STAFF_ROLES.includes(u.role) || profileIds.has(u.id)) {
        byId.set(u.id, u);
      }
    }
    return Array.from(byId.values());
  }

  private async getCompanyWithSchedulableStaff(companyId: string): Promise<{
    company: Company;
    staff: User[];
    profiles: StaffCompensationProfile[];
  }> {
    const [company, profiles] = await Promise.all([
      this.companyRepository.findOne({
        where: { id: companyId },
        relations: ['users'],
      }),
      this.compensationRepository.find({
        where: { companyId },
        order: { sortOrder: 'ASC' },
      }),
    ]);
    if (!company) {
      throw new NotFoundException('Centro no encontrado');
    }
    const staff = this.getSchedulableStaff(
      company,
      profiles.map((p) => p.userId),
    );
    return { company, staff, profiles };
  }

  private async getActiveScheduleConfigs(companyId: string): Promise<ScheduleConfig[]> {
    return this.scheduleConfigRepository.find({
      where: { company: { id: companyId }, isActive: true },
    });
  }

  private async getExceptionsForRange(
    companyId: string,
    startDate: string,
    endDate: string,
  ): Promise<ScheduleException[]> {
    return this.scheduleExceptionRepository.find({
      where: {
        company: { id: companyId },
        isActive: true,
        exceptionDate: Between(parseCalendarDate(startDate), parseCalendarDate(endDate)),
      },
    });
  }

  private isDayClosedByException(
    dateStr: string,
    exceptions: ScheduleException[],
  ): boolean {
    const dayExceptions = exceptions.filter(
      (e) => toCalendarDateString(e.exceptionDate) === dateStr,
    );
    return dayExceptions.some((e) => e.isClosed);
  }

  private slotsForDate(
    dateStr: string,
    configs: ScheduleConfig[],
    exceptions: ScheduleException[],
  ): SlotRow[] {
    if (this.isDayClosedByException(dateStr, exceptions)) {
      return [];
    }
    const d = parseCalendarDate(dateStr);
    const dayOfWeek = d.getDay();
    const config = configs.find((c) => c.dayOfWeek === dayOfWeek);
    if (!config) return [];
    return generateStaffGridSlots(
      config.startTime,
      config.endTime,
      config.slotDurationMinutes || 60,
    );
  }

  private mergeWeekSlots(weekDates: string[], configs: ScheduleConfig[], exceptions: ScheduleException[]): SlotRow[] {
    const map = new Map<string, SlotRow>();
    for (const date of weekDates) {
      for (const slot of this.slotsForDate(date, configs, exceptions)) {
        const key = slot.startTime;
        if (!map.has(key)) {
          map.set(key, slot);
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.startTime.localeCompare(b.startTime),
    );
  }

  async getGridTemplate(companyId: string, user: User, weekStartParam?: string) {
    await this.assertCompanyAccess(user, companyId);
    const weekStart = weekStartParam
      ? getWeekStartMonday(weekStartParam)
      : getWeekStartMonday(toCalendarDateString(new Date()));
    const weekDates = getWeekDates(weekStart);
    const weekEnd = weekDates[6];
    const configs = await this.getActiveScheduleConfigs(companyId);
    const exceptions = await this.getExceptionsForRange(companyId, weekStart, weekEnd);
    const slots = this.mergeWeekSlots(weekDates, configs, exceptions);

    const days = weekDates.map((date) => ({
      date,
      dayOfWeek: parseCalendarDate(date).getDay(),
      label: formatDayLabel(date),
      isClosedAllDay: this.isDayClosedByException(date, exceptions),
      hasSchedule: this.slotsForDate(date, configs, exceptions).length > 0,
    }));

    const noteEntity = await this.weekNoteRepository.findOne({
      where: { companyId, weekStartDate: parseCalendarDate(weekStart) as unknown as Date },
    });

    return {
      weekStart,
      weekEnd,
      note: noteEntity?.note ?? null,
      days,
      slots,
    };
  }

  async getWeekAssignments(companyId: string, user: User, weekStartParam?: string) {
    await this.assertCompanyAccess(user, companyId);
    const weekStart = weekStartParam
      ? getWeekStartMonday(weekStartParam)
      : getWeekStartMonday(toCalendarDateString(new Date()));
    const weekEnd = addDays(weekStart, 6);

    const [assignments, closures, company] = await Promise.all([
      this.assignmentRepository.find({
        where: {
          companyId,
          date: Between(parseCalendarDate(weekStart), parseCalendarDate(weekEnd)),
        },
        relations: ['user'],
      }),
      this.closureRepository.find({
        where: {
          companyId,
          date: Between(parseCalendarDate(weekStart), parseCalendarDate(weekEnd)),
        },
      }),
      this.companyRepository.findOne({
        where: { id: companyId },
        relations: ['users'],
      }),
    ]);

    const profiles = await this.compensationRepository.find({ where: { companyId } });
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const cells: Record<
      string,
      {
        isClosed: boolean;
        assignees: Array<{
          userId: string;
          name: string;
          displayColor?: string;
        }>;
      }
    > = {};

    for (const closure of closures) {
      const date = toCalendarDateString(closure.date);
      const key = cellKey(date, closure.startTime);
      cells[key] = { isClosed: true, assignees: [] };
    }

    for (const assignment of assignments) {
      const date = toCalendarDateString(assignment.date);
      const key = cellKey(date, assignment.startTime);
      if (!cells[key]) {
        cells[key] = { isClosed: false, assignees: [] };
      }
      if (cells[key].isClosed) continue;
      const u = assignment.user;
      const profile = profileByUser.get(assignment.userId);
      cells[key].assignees.push({
        userId: assignment.userId,
        name: formatStaffDisplayNameFromParts(u?.name, u?.lastName),
        displayColor: profile?.displayColor ?? undefined,
      });
    }

    const staff = company
      ? this.getSchedulableStaff(
          company,
          profiles.map((p) => p.userId),
        )
      : [];

    return {
      weekStart,
      weekEnd,
      cells,
      staff: staff.map((s) => ({
        id: s.id,
        name: formatStaffDisplayNameFromParts(s.name, s.lastName),
        role: s.role,
        payType: profileByUser.get(s.id)?.payType ?? StaffPayType.HOURLY,
        displayColor: profileByUser.get(s.id)?.displayColor,
      })),
    };
  }

  async upsertWeekAssignments(
    companyId: string,
    user: User,
    weekStartParam: string,
    dto: UpsertWeekAssignmentsDto,
  ) {
    const company = await this.assertCompanyAccess(user, companyId);
    const weekStart = getWeekStartMonday(weekStartParam);
    const weekEnd = addDays(weekStart, 6);
    const profiles = await this.compensationRepository.find({ where: { companyId } });
    const staffIds = new Set(
      this.getSchedulableStaff(company, profiles.map((p) => p.userId)).map((s) => s.id),
    );

    for (const cell of dto.cells) {
      if (cell.date < weekStart || cell.date > weekEnd) {
        throw new BadRequestException(`La fecha ${cell.date} no pertenece a la semana seleccionada`);
      }
      for (const uid of cell.userIds) {
        if (!staffIds.has(uid)) {
          throw new BadRequestException(`Usuario ${uid} no es staff válido del centro`);
        }
      }
    }

    await this.assignmentRepository.delete({
      companyId,
      date: Between(parseCalendarDate(weekStart), parseCalendarDate(weekEnd)),
    });
    await this.closureRepository.delete({
      companyId,
      date: Between(parseCalendarDate(weekStart), parseCalendarDate(weekEnd)),
    });

    const assignments: StaffShiftAssignment[] = [];
    const closures: StaffShiftClosure[] = [];

    for (const cell of dto.cells) {
      if (cell.isClosed) {
        closures.push(
          this.closureRepository.create({
            companyId,
            date: parseCalendarDate(cell.date) as unknown as Date,
            startTime: cell.startTime,
            endTime: cell.endTime,
          }),
        );
        continue;
      }
      for (const userId of cell.userIds) {
        assignments.push(
          this.assignmentRepository.create({
            companyId,
            userId,
            date: parseCalendarDate(cell.date) as unknown as Date,
            startTime: cell.startTime,
            endTime: cell.endTime,
            durationMinutes: cell.durationMinutes,
          }),
        );
      }
    }

    if (closures.length) await this.closureRepository.save(closures);
    if (assignments.length) await this.assignmentRepository.save(assignments);

    if (dto.note !== undefined) {
      let noteEntity = await this.weekNoteRepository.findOne({
        where: { companyId, weekStartDate: parseCalendarDate(weekStart) as unknown as Date },
      });
      if (!noteEntity) {
        noteEntity = this.weekNoteRepository.create({
          companyId,
          weekStartDate: parseCalendarDate(weekStart) as unknown as Date,
        });
      }
      noteEntity.note = dto.note || null;
      await this.weekNoteRepository.save(noteEntity);
    }

    return this.getWeekAssignments(companyId, user, weekStart);
  }

  async copyPreviousWeek(
    companyId: string,
    user: User,
    targetWeekStart: string,
    sourceWeekStart: string,
  ) {
    const target = getWeekStartMonday(targetWeekStart);
    const source = getWeekStartMonday(sourceWeekStart);
    if (target === source) {
      throw new BadRequestException('La semana origen y destino deben ser distintas');
    }

    const sourceEnd = addDays(source, 6);
    const [assignments, closures, sourceNote] = await Promise.all([
      this.assignmentRepository.find({
        where: {
          companyId,
          date: Between(parseCalendarDate(source), parseCalendarDate(sourceEnd)),
        },
      }),
      this.closureRepository.find({
        where: {
          companyId,
          date: Between(parseCalendarDate(source), parseCalendarDate(sourceEnd)),
        },
      }),
      this.weekNoteRepository.findOne({
        where: { companyId, weekStartDate: parseCalendarDate(source) as unknown as Date },
      }),
    ]);

    const dayOffset = (srcDate: string) =>
      Math.round(
        (parseCalendarDate(srcDate).getTime() - parseCalendarDate(source).getTime()) /
          86400000,
      );

    const cells: UpsertWeekAssignmentsDto['cells'] = [];
    const processed = new Set<string>();

    for (const closure of closures) {
      const srcDate = toCalendarDateString(closure.date);
      const targetDate = addDays(target, dayOffset(srcDate));
      const key = cellKey(targetDate, closure.startTime);
      if (processed.has(key)) continue;
      processed.add(key);
      cells.push({
        date: targetDate,
        startTime: closure.startTime,
        endTime: closure.endTime,
        durationMinutes: 60,
        isClosed: true,
        userIds: [],
      });
    }

    const grouped = new Map<
      string,
      { endTime: string; durationMinutes: number; userIds: string[] }
    >();

    for (const a of assignments) {
      const srcDate = toCalendarDateString(a.date);
      const targetDate = addDays(target, dayOffset(srcDate));
      const key = cellKey(targetDate, a.startTime);
      if (!grouped.has(key)) {
        grouped.set(key, {
          endTime: a.endTime,
          durationMinutes: a.durationMinutes,
          userIds: [],
        });
      }
      grouped.get(key)!.userIds.push(a.userId);
    }

    for (const [key, data] of grouped) {
      if (processed.has(key)) continue;
      const [date, startTime] = key.split('|');
      cells.push({
        date,
        startTime,
        endTime: data.endTime,
        durationMinutes: data.durationMinutes,
        isClosed: false,
        userIds: [...new Set(data.userIds)],
      });
      processed.add(key);
    }

    return this.upsertWeekAssignments(companyId, user, target, {
      note: sourceNote?.note,
      cells,
    });
  }

  private async getAssignmentsForYear(companyId: string, year: number) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return this.assignmentRepository.find({
      where: {
        companyId,
        date: Between(parseCalendarDate(start), parseCalendarDate(end)),
      },
    });
  }

  async getHoursSummary(companyId: string, user: User, year: number) {
    await this.assertCompanyAccess(user, companyId);
    const { company, staff, profiles } = await this.getCompanyWithSchedulableStaff(companyId);
    const assignments = await this.getAssignmentsForYear(companyId, year);
    const profileOrder = new Map(profiles.map((p, i) => [p.userId, p.sortOrder ?? i]));

    const hoursByUserMonth = new Map<string, number[]>();
    for (const s of staff) {
      hoursByUserMonth.set(s.id, Array(12).fill(0));
    }

    for (const a of assignments) {
      const dateStr = toCalendarDateString(a.date);
      const y = parseInt(dateStr.slice(0, 4), 10);
      if (y !== year) continue;
      const month = parseInt(dateStr.slice(5, 7), 10);
      const hours = (a.durationMinutes || 60) / 60;
      if (!hoursByUserMonth.has(a.userId)) {
        hoursByUserMonth.set(a.userId, Array(12).fill(0));
      }
      const arr = hoursByUserMonth.get(a.userId)!;
      arr[month - 1] += hours;
    }

    const staffIds = new Set(staff.map((s) => s.id));
    const extraUserIds = [...hoursByUserMonth.keys()].filter((id) => !staffIds.has(id));
    const companyUsers = new Map((company.users ?? []).map((u) => [u.id, u]));
    const allRowUsers = [
      ...staff,
      ...extraUserIds
        .map((id) => companyUsers.get(id))
        .filter((u): u is User => !!u && u.isActive !== false),
    ];

    const monthTotals = Array(12).fill(0);
    const rows = allRowUsers
      .sort((a, b) => (profileOrder.get(a.id) ?? 999) - (profileOrder.get(b.id) ?? 999))
      .map((s) => {
        const months = hoursByUserMonth.get(s.id) ?? Array(12).fill(0);
        const total = months.reduce((acc, n) => acc + n, 0);
        months.forEach((h, i) => {
          monthTotals[i] += h;
        });
        return {
          userId: s.id,
          name: formatStaffDisplayNameFromParts(s.name, s.lastName),
          role: s.role,
          months: Object.fromEntries(months.map((h, i) => [i + 1, h > 0 ? h : null])),
          total: total > 0 ? total : null,
        };
      });

    return {
      year,
      rows,
      monthTotals: Object.fromEntries(monthTotals.map((h, i) => [i + 1, h > 0 ? h : null])),
      grandTotal: monthTotals.reduce((a, b) => a + b, 0) || null,
    };
  }

  async getPayroll(companyId: string, user: User, year: number, month: number) {
    await this.assertCompanyAccess(user, companyId);
    const { staff, profiles } = await this.getCompanyWithSchedulableStaff(companyId);
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEndDate = new Date(Date.UTC(year, month, 0));
    const monthEnd = toCalendarDateString(monthEndDate);

    const assignments = await this.assignmentRepository.find({
      where: {
        companyId,
        date: Between(parseCalendarDate(monthStart), parseCalendarDate(monthEnd)),
      },
    });

    const hoursByUser = new Map<string, number>();
    for (const a of assignments) {
      const h = (a.durationMinutes || 60) / 60;
      hoursByUser.set(a.userId, (hoursByUser.get(a.userId) ?? 0) + h);
    }

    let totalHours = 0;
    const lines = staff.map((s) => {
      const hoursMonth = hoursByUser.get(s.id) ?? 0;
      totalHours += hoursMonth;
      const profile = profileByUser.get(s.id);
      const payType = profile?.payType ?? StaffPayType.HOURLY;
      const hourlyRate = profile?.hourlyRate != null ? Number(profile.hourlyRate) : 0;
      const fixedAmount =
        profile?.fixedMonthlyAmount != null ? Number(profile.fixedMonthlyAmount) : 0;

      let monthlyTotal = 0;
      if (payType === StaffPayType.FIXED_MONTHLY) {
        monthlyTotal = fixedAmount;
      } else if (payType === StaffPayType.WEEKLY_HOURS_X4) {
        monthlyTotal = hoursMonth * hourlyRate;
      } else {
        monthlyTotal = hoursMonth * hourlyRate;
      }

      return {
        userId: s.id,
        name: formatStaffDisplayNameFromParts(s.name, s.lastName),
        role: s.role,
        payType,
        hoursMonth,
        hourlyRate: payType === StaffPayType.FIXED_MONTHLY ? null : hourlyRate,
        fixedAmount: payType === StaffPayType.FIXED_MONTHLY ? fixedAmount : null,
        percentOfTotal: 0,
        monthlyTotal,
        displayColor: profile?.displayColor,
      };
    });

    for (const line of lines) {
      line.percentOfTotal =
        totalHours > 0 ? Math.round((line.hoursMonth / totalHours) * 1000) / 10 : 0;
    }

    const grandTotal = lines.reduce((acc, l) => acc + l.monthlyTotal, 0);

    return {
      year,
      month,
      lines,
      totalHours,
      grandTotal,
    };
  }

  async getCompensationProfiles(companyId: string, user: User) {
    await this.assertCompanyAccess(user, companyId);
    const { company, staff, profiles: existingProfiles } =
      await this.getCompanyWithSchedulableStaff(companyId);
    let profiles = existingProfiles;

    const existing = new Set(profiles.map((p) => p.userId));
    const toCreate: StaffCompensationProfile[] = [];
    staff.forEach((s, index) => {
      if (!existing.has(s.id)) {
        toCreate.push(
          this.compensationRepository.create({
            companyId,
            userId: s.id,
            payType: StaffPayType.HOURLY,
            sortOrder: index,
            displayColor: DEFAULT_STAFF_COLORS[index % DEFAULT_STAFF_COLORS.length],
          }),
        );
      }
    });
    if (toCreate.length) {
      profiles = await this.compensationRepository.save(toCreate);
      profiles = await this.compensationRepository.find({
        where: { companyId },
        order: { sortOrder: 'ASC' },
      });
    }

    const companyUsers = new Map((company.users ?? []).map((u) => [u.id, u]));

    return profiles
      .filter((p) => companyUsers.has(p.userId))
      .map((p) => {
        const s = companyUsers.get(p.userId)!;
        return {
          id: p.id,
          userId: p.userId,
          name: formatStaffDisplayNameFromParts(s.name, s.lastName),
          role: s.role,
          payType: p.payType,
          hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : null,
          fixedMonthlyAmount:
            p.fixedMonthlyAmount != null ? Number(p.fixedMonthlyAmount) : null,
          displayColor: p.displayColor,
          sortOrder: p.sortOrder,
        };
      });
  }

  async updateCompensationProfiles(
    companyId: string,
    user: User,
    dto: UpdateCompensationBatchDto,
  ) {
    await this.assertCompanyAccess(user, companyId);

    for (const item of dto.profiles) {
      let profile = await this.compensationRepository.findOne({
        where: { companyId, userId: item.userId },
      });
      if (!profile) {
        profile = this.compensationRepository.create({
          companyId,
          userId: item.userId,
        });
      }
      profile.payType = item.payType;
      profile.hourlyRate =
        item.hourlyRate != null ? String(item.hourlyRate) : null;
      profile.fixedMonthlyAmount =
        item.fixedMonthlyAmount != null ? String(item.fixedMonthlyAmount) : null;
      if (item.displayColor !== undefined) profile.displayColor = item.displayColor;
      if (item.sortOrder !== undefined) profile.sortOrder = item.sortOrder;
      await this.compensationRepository.save(profile);
    }

    return this.getCompensationProfiles(companyId, user);
  }
}
