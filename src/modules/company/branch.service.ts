import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Branch } from '../../entities/branch.entity';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { AthleteInvitation, InvitationStatus } from '../../entities/athlete-invitation.entity';
import { UserRole } from '../../common/enums/enums';
import { CreateBranchDto, EnableBranchesDto, UpdateBranchDto } from './dto/branch.dto';

const MANAGE_ROLES = [UserRole.DIRECTOR, UserRole.SECRETARIA, UserRole.STP_ADMIN];

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepository: Repository<AthleteInvitation>,
    private readonly dataSource: DataSource,
  ) {}

  async list(companyId: string, user: User): Promise<Branch[]> {
    await this.assertCanView(user, companyId);
    return this.branchRepository.find({
      where: { companyId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async enable(companyId: string, user: User, dto?: EnableBranchesDto) {
    await this.assertCanManage(user, companyId);
    const company = await this.requireCompany(companyId);
    if (company.multiBranchEnabled) {
      const branches = await this.branchRepository.find({
        where: { companyId },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      return { company, branches };
    }

    const primaryName = dto?.name?.trim() || 'Sede principal';
    return this.dataSource.transaction(async (manager) => {
      let primary = await manager.findOne(Branch, {
        where: { companyId, isPrimary: true },
      });
      if (!primary) {
        const count = await manager.count(Branch, { where: { companyId } });
        primary = await manager.save(
          manager.create(Branch, {
            companyId,
            name: primaryName,
            isPrimary: true,
            isActive: true,
            sortOrder: count,
          }),
        );
      } else if (dto?.name?.trim()) {
        primary.name = primaryName;
        primary = await manager.save(primary);
      }

      const branchId = primary.id;
      const updates: Array<[string, string]> = [
        ['athlete_invitations', 'home_branch_id'],
        ['payment', 'branch_id'],
        ['payment_plans', 'branch_id'],
        ['expense', 'branch_id'],
        ['fixed_expense_template', 'branch_id'],
        ['time_slot', 'branch_id'],
        ['schedule_config', 'branch_id'],
        ['schedule_resource', 'branch_id'],
        ['schedule_exception', 'branch_id'],
        ['athlete_schedules', 'branch_id'],
        ['sale', 'branch_id'],
        ['staff_shift_assignment', 'branch_id'],
        ['staff_shift_closure', 'branch_id'],
        ['staff_week_note', 'branch_id'],
        ['time_slot_generation', 'branch_id'],
      ];

      for (const [table, column] of updates) {
        const realTable = await this.resolveTable(manager, table);
        const companyColumn = await this.companyColumn(manager, realTable);
        await manager.query(
          `UPDATE ${this.quote(realTable)} SET ${this.quote(column)} = $1 WHERE ${this.quote(companyColumn)} = $2 AND ${this.quote(column)} IS NULL`,
          [branchId, companyId],
        );
      }

      await manager.query(
        `
        INSERT INTO product_branch_stock (product_id, branch_id, stock_deposit, stock_fridge, stock_counter)
        SELECT p.id, $1, p."stockDeposit", p."stockFridge", p."stockCounter"
        FROM product p
        WHERE p."companyId" = $2
        ON CONFLICT (product_id, branch_id) DO NOTHING
        `,
        [branchId, companyId],
      );

      company.multiBranchEnabled = true;
      await manager.save(Company, company);
      const branches = await manager.find(Branch, {
        where: { companyId },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      return { company, branches };
    });
  }

  async disable(companyId: string, user: User) {
    await this.assertCanManage(user, companyId);
    const company = await this.requireCompany(companyId);
    const count = await this.branchRepository.count({ where: { companyId } });
    if (count > 1) {
      throw new BadRequestException(
        'No se puede apagar multi sede si hay más de una sede',
      );
    }
    company.multiBranchEnabled = false;
    await this.companyRepository.save(company);
    return company;
  }

  async create(companyId: string, user: User, dto: CreateBranchDto): Promise<Branch> {
    await this.assertCanManage(user, companyId);
    const company = await this.requireCompany(companyId);
    if (!company.multiBranchEnabled) {
      throw new BadRequestException('Activá multi sede antes de crear sedes');
    }
    const count = await this.branchRepository.count({ where: { companyId } });
    const branch = await this.branchRepository.save(
      this.branchRepository.create({
        companyId,
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        isActive: true,
        isPrimary: false,
        sortOrder: count,
      }),
    );
    await this.dataSource.query(
      `
      INSERT INTO product_branch_stock (product_id, branch_id, stock_deposit, stock_fridge, stock_counter)
      SELECT p.id, $1, 0, 0, 0
      FROM product p
      WHERE p."companyId" = $2
      ON CONFLICT (product_id, branch_id) DO NOTHING
      `,
      [branch.id, companyId],
    );
    return branch;
  }

  async update(
    companyId: string,
    branchId: string,
    user: User,
    dto: UpdateBranchDto,
  ): Promise<Branch> {
    await this.assertCanManage(user, companyId);
    const branch = await this.requireBranch(companyId, branchId);
    if (dto.name !== undefined) branch.name = dto.name.trim();
    if (dto.address !== undefined) branch.address = dto.address?.trim() || null;
    if (dto.isActive !== undefined) {
      if (!dto.isActive && branch.isPrimary) {
        const others = await this.branchRepository.count({
          where: { companyId, isActive: true },
        });
        if (others <= 1) {
          throw new BadRequestException('No se puede desactivar la única sede activa');
        }
      }
      branch.isActive = dto.isActive;
    }
    return this.branchRepository.save(branch);
  }

  private async requireCompany(companyId: string): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Centro no encontrado');
    return company;
  }

  private async requireBranch(companyId: string, branchId: string): Promise<Branch> {
    const branch = await this.branchRepository.findOne({ where: { id: branchId, companyId } });
    if (!branch) throw new NotFoundException('Sede no encontrada');
    return branch;
  }

  private async assertCanManage(user: User, companyId: string) {
    await this.assertCanView(user, companyId);
    if (user.role === UserRole.STP_ADMIN) return;
    if (!MANAGE_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tenés permiso para administrar sedes');
    }
  }

  private async assertCanView(user: User, companyId: string) {
    if (user.role === UserRole.STP_ADMIN) {
      await this.requireCompany(companyId);
      return;
    }
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) throw new NotFoundException('Centro no encontrado');
    if ((company.users ?? []).some((member) => member.id === user.id)) return;
    const invitation = await this.invitationRepository.findOne({
      where: {
        company: { id: companyId },
        user: { id: user.id },
        status: InvitationStatus.APPROVED,
      },
    });
    if (!invitation) throw new ForbiddenException('No pertenecés a este centro');
  }

  private quote(identifier: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
      throw new BadRequestException('Identificador inválido');
    }
    return `"${identifier}"`;
  }

  private async resolveTable(
    manager: { query: (sql: string, params?: unknown[]) => Promise<Array<{ name: string }>> },
    table: string,
  ): Promise<string> {
    const rows = await manager.query(
      `
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND lower(c.relname) = lower($1)
      LIMIT 1
      `,
      [table],
    );
    const name = rows[0]?.name;
    if (!name) throw new BadRequestException(`No se encontró la tabla ${table}`);
    return name;
  }

  private async companyColumn(
    manager: { query: (sql: string, params?: unknown[]) => Promise<Array<{ column_name: string }>> },
    table: string,
  ): Promise<string> {
    const rows = await manager.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND lower(table_name) = lower($1)
        AND column_name IN ('companyId', 'company_id')
      `,
      [table],
    );
    const name = rows[0]?.column_name;
    if (!name) throw new BadRequestException(`La tabla ${table} no tiene company`);
    return name;
  }
}
