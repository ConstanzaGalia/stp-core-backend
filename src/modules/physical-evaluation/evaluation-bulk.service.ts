import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import { AthletesService } from '../athletes/athletes.service';
import { CompanyService } from '../company/company.service';
import { PhysicalEvaluationService } from './physical-evaluation.service';
import {
  PhotocellImportService,
  type PhotocellAthleteGroupPreview,
  type PhotocellPreviewResponse,
} from './photocell-import.service';
import {
  BulkDuplicateCheckDto,
  PhotocellBatchConfirmDto,
  PhotocellBatchPreviewDto,
} from './dto/photocell-batch-import.dto';
import {
  matchAthleteByName,
  normalizePersonName,
  type MatchConfidence,
  type RosterAthleteCandidate,
} from './athlete-match.util';

const STAFF_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

export type BulkMatchedGroup = {
  sourceNameHint: string;
  rowCount: number;
  matchConfidence: MatchConfidence;
  athleteId: string | null;
  athleteName: string | null;
  athleteLastName: string | null;
  candidates: Array<{
    athleteId: string;
    name: string;
    lastName: string;
    email?: string | null;
    score: number;
  }>;
  duplicates: Array<{
    id: string;
    device: string | null;
    protocolCode: string | null;
    attempt: number | null;
    evaluationDate: string;
  }>;
  included: boolean;
  headers: string[];
  rows: Array<Array<string | null>>;
  warnings: string[];
  evaluations: PhotocellAthleteGroupPreview['evaluations'];
  protocolCode: string | null;
  protocolLabel: string | null;
  testType: string | null;
  completeness: number;
  error: string | null;
};

@Injectable()
export class EvaluationBulkService {
  constructor(
    private readonly physicalEvaluations: PhysicalEvaluationService,
    private readonly photocellImport: PhotocellImportService,
    private readonly athletesService: AthletesService,
    private readonly companyService: CompanyService,
  ) {}

  private isStaff(user: User): boolean {
    return STAFF_ROLES.includes(user.role);
  }

  private async assertStaffCanAccessCompany(actor: User, companyId: string): Promise<void> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Sin permiso');
    }
    if (actor.role === UserRole.STP_ADMIN) return;
    const staffCompanies = await this.companyService.findCompaniesByUser(actor.id);
    if (!staffCompanies.some((c) => c.id === companyId)) {
      throw new ForbiddenException('No perteneces a este centro');
    }
  }

  async getBulkRoster(
    actor: User,
    companyId: string,
    divisionId?: string | null,
  ): Promise<
    Array<{
      athleteId: string;
      name: string;
      lastName: string;
      email: string | null;
      divisionId: string | null;
      evaluationPortalOnly: boolean;
    }>
  > {
    await this.assertStaffCanAccessCompany(actor, companyId);
    const invitations = await this.athletesService.getCompanyAthletesIncludingPortal(companyId, actor);
    return invitations
      .filter((inv) => inv.user?.id)
      .filter((inv) => {
        if (!divisionId) return true;
        return inv.divisionId === divisionId || inv.division?.id === divisionId;
      })
      .map((inv) => ({
        athleteId: inv.user!.id,
        name: inv.user!.name ?? '',
        lastName: inv.user!.lastName ?? '',
        email: inv.user!.email ?? null,
        divisionId: inv.divisionId ?? inv.division?.id ?? null,
        evaluationPortalOnly: inv.user!.evaluationPortalOnly === true,
      }))
      .sort((a, b) => `${a.lastName} ${a.name}`.localeCompare(`${b.lastName} ${b.name}`, 'es'));
  }

  async checkDuplicates(actor: User, companyId: string, dto: BulkDuplicateCheckDto) {
    await this.assertStaffCanAccessCompany(actor, companyId);
    if (dto.items.length > 500) {
      throw new BadRequestException('Máximo 500 ítems por consulta de duplicados');
    }

    const results = [];
    for (const item of dto.items) {
      await this.physicalEvaluations.assertCanAccessAthlete(actor, item.athleteId, false);
      const duplicates = await this.physicalEvaluations.findDuplicateEvaluations({
        athleteId: item.athleteId,
        evaluationDateIso: item.evaluationDate,
        device: item.device,
        protocolCode: item.protocolCode,
      });
      results.push({
        athleteId: item.athleteId,
        evaluationDate: item.evaluationDate,
        device: item.device ?? null,
        protocolCode: item.protocolCode ?? null,
        duplicates,
      });
    }
    return { items: results };
  }

  async previewPhotocellBatch(actor: User, companyId: string, dto: PhotocellBatchPreviewDto) {
    await this.assertStaffCanAccessCompany(actor, companyId);

    const rosterRows = await this.getBulkRoster(actor, companyId, dto.divisionId);
    const roster: RosterAthleteCandidate[] = rosterRows.map((row) => ({
      athleteId: row.athleteId,
      name: row.name,
      lastName: row.lastName,
      email: row.email,
      divisionId: row.divisionId,
    }));

    const multi = await this.photocellImport.buildMultiAthletePreview({
      evaluationDate: dto.evaluationDate,
      protocolCode: dto.protocolCode,
      sourceName: dto.sourceName,
      headers: dto.headers,
      rows: dto.rows,
    });

    const mappingByHint = new Map(
      (dto.athleteMappings ?? []).map((m) => [normalizePersonName(m.sourceNameHint), m.athleteId]),
    );

    const groups: BulkMatchedGroup[] = [];
    for (const group of multi.groups) {
      const mappedId = mappingByHint.get(normalizePersonName(group.sourceNameHint));
      let match = matchAthleteByName(group.sourceNameHint, roster);
      if (mappedId) {
        const mapped = roster.find((r) => r.athleteId === mappedId);
        if (mapped) {
          match = {
            confidence: 'exact',
            athleteId: mapped.athleteId,
            candidates: [
              {
                athleteId: mapped.athleteId,
                name: mapped.name,
                lastName: mapped.lastName,
                email: mapped.email ?? null,
                score: 1,
              },
              ...match.candidates.filter((c) => c.athleteId !== mapped.athleteId),
            ],
          };
        }
      }

      const matchedAthlete = match.athleteId
        ? roster.find((r) => r.athleteId === match.athleteId)
        : null;

      let duplicates: BulkMatchedGroup['duplicates'] = [];
      if (match.athleteId && group.protocolCode) {
        duplicates = await this.physicalEvaluations.findDuplicateEvaluations({
          athleteId: match.athleteId,
          evaluationDateIso: dto.evaluationDate,
          device: 'photocells',
          protocolCode: group.protocolCode,
        });
      }

      groups.push({
        sourceNameHint: group.sourceNameHint,
        rowCount: group.rowCount,
        matchConfidence: match.confidence,
        athleteId: match.athleteId,
        athleteName: matchedAthlete?.name ?? null,
        athleteLastName: matchedAthlete?.lastName ?? null,
        candidates: match.candidates,
        duplicates,
        included: Boolean(match.athleteId) && !group.error && duplicates.length === 0,
        headers: group.headers,
        rows: group.rows,
        warnings: group.warnings,
        evaluations: group.evaluations,
        protocolCode: group.protocolCode,
        protocolLabel: group.protocolLabel,
        testType: group.testType,
        completeness: group.completeness,
        error: group.error,
      });
    }

    const summary = {
      totalAthletesInFile: groups.length,
      matched: groups.filter((g) => g.athleteId).length,
      exact: groups.filter((g) => g.matchConfidence === 'exact').length,
      probable: groups.filter((g) => g.matchConfidence === 'probable').length,
      ambiguous: groups.filter((g) => g.matchConfidence === 'ambiguous').length,
      unmatched: groups.filter((g) => !g.athleteId).length,
      withErrors: groups.filter((g) => g.error).length,
      withDuplicates: groups.filter((g) => g.duplicates.length > 0).length,
    };

    return {
      companyId,
      divisionId: dto.divisionId ?? null,
      evaluationDate: dto.evaluationDate,
      sourceType: 'photocell_bulk' as const,
      sourceName: multi.sourceName,
      warnings: multi.warnings,
      summary,
      groups,
      rosterCount: roster.length,
    };
  }

  async confirmPhotocellBatch(actor: User, companyId: string, dto: PhotocellBatchConfirmDto) {
    await this.assertStaffCanAccessCompany(actor, companyId);
    if (!this.isStaff(actor)) {
      throw new ForbiddenException('Solo el staff puede registrar evaluaciones');
    }
    if (dto.items.length > 200) {
      throw new BadRequestException('Máximo 200 atletas por confirmación masiva');
    }

    const onDuplicate = dto.onDuplicate ?? 'skip';
    const created: Array<{
      athleteId: string;
      evaluationIds: string[];
      protocolCode: string | null;
    }> = [];
    const skipped: Array<{
      athleteId: string;
      reason: 'duplicate' | 'no_access' | 'error';
      message: string;
      protocolCode?: string | null;
    }> = [];
    const errors: Array<{ athleteId: string; message: string }> = [];

    for (const item of dto.items) {
      try {
        await this.physicalEvaluations.assertCanAccessAthlete(actor, item.athleteId, true);

        const preview = await this.photocellImport.buildPreview({
          athleteId: item.athleteId,
          evaluationDate: item.evaluationDate,
          protocolCode: item.protocolCode,
          sourceName: item.sourceName,
          headers: item.headers,
          rows: item.rows,
        });

        const protocolCodes = [
          ...new Set(preview.evaluations.map((e) => e.protocolCode).filter(Boolean)),
        ];
        let hasDuplicate = false;
        for (const code of protocolCodes) {
          const duplicates = await this.physicalEvaluations.findDuplicateEvaluations({
            athleteId: item.athleteId,
            evaluationDateIso: item.evaluationDate,
            device: 'photocells',
            protocolCode: code,
          });
          if (duplicates.length) {
            hasDuplicate = true;
            if (item.forceCreate) continue;
            if (onDuplicate === 'error') {
              throw new BadRequestException(
                `Ya existe evaluación ${code} para este atleta en ${item.evaluationDate}`,
              );
            }
            skipped.push({
              athleteId: item.athleteId,
              reason: 'duplicate',
              message: `Duplicado: ${code} en ${item.evaluationDate}`,
              protocolCode: code,
            });
          }
        }
        if (hasDuplicate && !item.forceCreate && onDuplicate === 'skip') {
          continue;
        }

        const saved = await this.physicalEvaluations.createPhotocellEvaluations(
          actor,
          preview as PhotocellPreviewResponse,
          dto.criteriaSetId ?? null,
        );
        const list = Array.isArray(saved) ? saved : [saved];
        created.push({
          athleteId: item.athleteId,
          evaluationIds: list.map((e) => e.id),
          protocolCode: preview.protocolCode ?? null,
        });
      } catch (error) {
        const message = extractErrorMessage(error)
        if (error instanceof ForbiddenException || error instanceof NotFoundException) {
          skipped.push({ athleteId: item.athleteId, reason: 'no_access', message })
        } else {
          errors.push({ athleteId: item.athleteId, message })
        }
      }
    }

    return {
      companyId,
      created,
      skipped,
      errors,
      summary: {
        createdAthletes: created.length,
        createdEvaluations: created.reduce((sum, row) => sum + row.evaluationIds.length, 0),
        skipped: skipped.length,
        errors: errors.length,
      },
    };
  }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof ForbiddenException || error instanceof NotFoundException || error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'message' in response) {
      const msg = (response as { message?: string | string[] }).message;
      if (Array.isArray(msg)) return msg.join('; ');
      if (typeof msg === 'string') return msg;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}
