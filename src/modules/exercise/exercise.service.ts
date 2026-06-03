import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { Pagination } from 'src/common/pagination/pagination';
import { UserRole } from 'src/common/enums/enums';
import { Company } from 'src/entities/company.entity';
import { Exercise } from 'src/entities/excercise.entity';
import { Category } from 'src/entities/category.entity';
import { MovementPattern } from 'src/entities/movement-pattern.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { Tag } from 'src/entities/tag.entity';
import { User } from 'src/entities/user.entity';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import {
  EXERCISE_PUBLISHER_COMPANY_IDS,
  isExerciseInPublisherCatalog,
  isExercisePublisherCompany,
} from './exercise.constants';
import { ExerciseWithAccess } from './exercise.types';

@Injectable()
export class ExerciseService {
  private readonly logger = new Logger(ExerciseService.name);

  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(MovementPattern)
    private readonly movementPatternRepository: Repository<MovementPattern>,
    @InjectRepository(SafetyTag)
    private readonly safetyTagRepository: Repository<SafetyTag>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    private pagination: Pagination,
  ) {}

  private readonly EXERCISE_RELATIONS = [
    'primaryCategory',
    'tags',
    'movementPattern',
    'safetyTags',
  ];

  private async assertCompanyAccess(
    user: User,
    companyId: string,
  ): Promise<Company> {
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
    if (!isMember) {
      throw new ForbiddenException('No tenés acceso a este centro');
    }
    return company;
  }

  private enrichExercise(
    exercise: Exercise,
    requestCompanyId: string,
  ): ExerciseWithAccess {
    const canEdit = isExercisePublisherCompany(requestCompanyId)
      ? isExerciseInPublisherCatalog(exercise.companyId)
      : exercise.companyId === requestCompanyId;
    return Object.assign(exercise, {
      canEdit,
      isShared: !canEdit,
    });
  }

  private applyCompanyScope(
    qb: SelectQueryBuilder<Exercise>,
    companyId: string,
  ): void {
    if (isExercisePublisherCompany(companyId)) {
      qb.andWhere('exercise.companyId IN (:...publisherIds)', {
        publisherIds: [...EXERCISE_PUBLISHER_COMPANY_IDS],
      });
    } else {
      qb.andWhere(
        '(exercise.companyId = :companyId OR exercise.companyId IN (:...publisherIds))',
        { companyId, publisherIds: [...EXERCISE_PUBLISHER_COMPANY_IDS] },
      );
    }
  }

  private assertCanMutateExercise(
    exercise: Exercise,
    companyId: string,
  ): void {
    if (isExercisePublisherCompany(companyId)) {
      if (!isExerciseInPublisherCatalog(exercise.companyId)) {
        throw new ForbiddenException(
          'No podés modificar ejercicios fuera del catálogo STP',
        );
      }
      return;
    }
    if (exercise.companyId !== companyId) {
      throw new ForbiddenException(
        'No podés modificar ejercicios del catálogo compartido',
      );
    }
  }

  private async findOneInScope(
    id: string,
    companyId: string,
  ): Promise<Exercise> {
    const qb = this.exerciseRepository
      .createQueryBuilder('exercise')
      .leftJoinAndSelect('exercise.primaryCategory', 'category')
      .leftJoinAndSelect('exercise.movementPattern', 'movementPattern')
      .leftJoinAndSelect('exercise.safetyTags', 'safetyTag')
      .leftJoinAndSelect('exercise.tags', 'tag')
      .where('exercise.id = :id', { id });

    this.applyCompanyScope(qb, companyId);

    const exercise = await qb.getOne();
    if (!exercise) {
      throw new NotFoundException(`Exercise ${id} not found`);
    }
    return exercise;
  }

  private calculateScore(data: Partial<Exercise>): number {
    return (
      (data.carga ? 1 : 0) +
      (data.unilateral ? 1 : 0) +
      (data.impacto ? 1 : 0) +
      (data.rotacion ? 1 : 0) +
      (data.multiarticular ? 1 : 0) +
      (data.inestabilidad ? 1 : 0)
    );
  }

  public async create(
    user: User,
    companyId: string,
    dto: CreateExerciseDto,
  ): Promise<ExerciseWithAccess> {
    await this.assertCompanyAccess(user, companyId);
    try {
      const exercise = this.exerciseRepository.create({
        companyId,
        name: dto.name,
        description: dto.description,
        video: dto.video,
        material: dto.material,
        unilateral: dto.unilateral ?? false,
        esIsometrico: dto.esIsometrico ?? false,
        isAncla: dto.isAncla ?? false,
        carga: dto.carga ?? false,
        impacto: dto.impacto ?? false,
        rotacion: dto.rotacion ?? false,
        multiarticular: dto.multiarticular ?? false,
        inestabilidad: dto.inestabilidad ?? false,
        faseRecomendada: dto.faseRecomendada,
      });

      exercise.scoreTotal = this.calculateScore(exercise);

      if (dto.primaryCategoryId) {
        exercise.primaryCategory = await this.categoryRepository.findOneBy({
          id: dto.primaryCategoryId,
        });
      }
      if (dto.movementPatternId) {
        exercise.movementPattern =
          await this.movementPatternRepository.findOneBy({
            id: dto.movementPatternId,
          });
      }
      if (dto.safetyTagIds?.length) {
        exercise.safetyTags = await this.safetyTagRepository.findBy({
          id: In(dto.safetyTagIds),
        });
      }
      if (dto.tagIds?.length) {
        exercise.tags = await this.tagRepository.findBy({ id: In(dto.tagIds) });
      }

      const saved = await this.exerciseRepository.save(exercise);
      return this.enrichExercise(saved, companyId);
    } catch (error) {
      this.logger.error('Error creating exercise', error);
      throw error;
    }
  }

  public async findAll(
    user: User,
    companyId: string,
    offset: number,
    limit: number,
    path: string,
  ): Promise<PaginatedListDto<ExerciseWithAccess>> {
    await this.assertCompanyAccess(user, companyId);

    const qb = this.exerciseRepository
      .createQueryBuilder('exercise')
      .leftJoinAndSelect('exercise.primaryCategory', 'category')
      .leftJoinAndSelect('exercise.movementPattern', 'movementPattern')
      .leftJoinAndSelect('exercise.safetyTags', 'safetyTag')
      .leftJoinAndSelect('exercise.tags', 'tag');

    this.applyCompanyScope(qb, companyId);
    qb.orderBy('exercise.name', 'ASC');

    const [exercises, count] = await qb
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return new PaginatedListDto(
      exercises.map((e) => this.enrichExercise(e, companyId)),
      this.pagination.buildPaginationDto(limit, offset, count, path),
    );
  }

  public async findOne(
    user: User,
    companyId: string,
    id: string,
  ): Promise<ExerciseWithAccess> {
    await this.assertCompanyAccess(user, companyId);
    const exercise = await this.findOneInScope(id, companyId);
    return this.enrichExercise(exercise, companyId);
  }

  public async update(
    user: User,
    companyId: string,
    id: string,
    dto: UpdateExerciseDto,
  ): Promise<ExerciseWithAccess> {
    await this.assertCompanyAccess(user, companyId);
    try {
      const exercise = await this.findOneInScope(id, companyId);
      this.assertCanMutateExercise(exercise, companyId);

      if (dto.name !== undefined) exercise.name = dto.name;
      if (dto.description !== undefined) exercise.description = dto.description;
      if (dto.video !== undefined) exercise.video = dto.video;
      if (dto.material !== undefined) exercise.material = dto.material;
      if (dto.unilateral !== undefined) exercise.unilateral = dto.unilateral;
      if (dto.esIsometrico !== undefined) exercise.esIsometrico = dto.esIsometrico;
      if (dto.isAncla !== undefined) exercise.isAncla = dto.isAncla;
      if (dto.carga !== undefined) exercise.carga = dto.carga;
      if (dto.impacto !== undefined) exercise.impacto = dto.impacto;
      if (dto.rotacion !== undefined) exercise.rotacion = dto.rotacion;
      if (dto.multiarticular !== undefined) exercise.multiarticular = dto.multiarticular;
      if (dto.inestabilidad !== undefined) exercise.inestabilidad = dto.inestabilidad;
      if (dto.faseRecomendada !== undefined) exercise.faseRecomendada = dto.faseRecomendada;

      exercise.scoreTotal = this.calculateScore(exercise);

      if (dto.primaryCategoryId !== undefined) {
        exercise.primaryCategory = dto.primaryCategoryId
          ? await this.categoryRepository.findOneBy({ id: dto.primaryCategoryId })
          : null;
      }
      if (dto.movementPatternId !== undefined) {
        exercise.movementPattern = dto.movementPatternId
          ? await this.movementPatternRepository.findOneBy({
              id: dto.movementPatternId,
            })
          : null;
      }
      if (dto.safetyTagIds !== undefined) {
        exercise.safetyTags = dto.safetyTagIds.length
          ? await this.safetyTagRepository.findBy({ id: In(dto.safetyTagIds) })
          : [];
      }
      if (dto.tagIds !== undefined) {
        exercise.tags = dto.tagIds.length
          ? await this.tagRepository.findBy({ id: In(dto.tagIds) })
          : [];
      }

      const saved = await this.exerciseRepository.save(exercise);
      return this.enrichExercise(saved, companyId);
    } catch (error) {
      this.logger.error(`Error updating exercise ${id}`, error);
      throw error;
    }
  }

  public async remove(
    user: User,
    companyId: string,
    id: string,
  ): Promise<string> {
    await this.assertCompanyAccess(user, companyId);
    try {
      const exercise = await this.findOneInScope(id, companyId);
      this.assertCanMutateExercise(exercise, companyId);
      await this.exerciseRepository.delete(id);
      return `Exercise ${id} deleted`;
    } catch (error) {
      this.logger.error(`Error deleting exercise ${id}`, error);
      throw error;
    }
  }

  public async findAllMovementPatterns(): Promise<MovementPattern[]> {
    return this.movementPatternRepository.find({ order: { name: 'ASC' } });
  }

  public async findAllSafetyTags(): Promise<SafetyTag[]> {
    return this.safetyTagRepository.find({ order: { key: 'ASC' } });
  }

  public async findAllCategories(): Promise<Category[]> {
    return this.categoryRepository.find({ order: { name: 'ASC' } });
  }

  public async filter(
    user: User,
    companyId: string,
    params: {
      maxScore?: number;
      excludeTagKeys?: string[];
      patternId?: number;
      categoryId?: number;
    },
  ): Promise<ExerciseWithAccess[]> {
    await this.assertCompanyAccess(user, companyId);

    const qb = this.exerciseRepository
      .createQueryBuilder('exercise')
      .leftJoinAndSelect('exercise.primaryCategory', 'category')
      .leftJoinAndSelect('exercise.movementPattern', 'movementPattern')
      .leftJoinAndSelect('exercise.safetyTags', 'safetyTag')
      .leftJoinAndSelect('exercise.tags', 'tag');

    this.applyCompanyScope(qb, companyId);

    if (params.maxScore !== undefined) {
      qb.andWhere('exercise.score_total <= :maxScore', {
        maxScore: params.maxScore,
      });
    }

    if (params.patternId) {
      qb.andWhere('movementPattern.id = :patternId', {
        patternId: params.patternId,
      });
    }

    if (params.categoryId) {
      qb.andWhere('category.id = :categoryId', { categoryId: params.categoryId });
    }

    if (params.excludeTagKeys?.length) {
      qb.andWhere(
        `exercise.id NOT IN (
          SELECT est."exerciseId" FROM exercise_safety_tags est
          INNER JOIN safety_tag st ON st.id = est."safetyTagId"
          WHERE st.key IN (:...excludeKeys)
        )`,
        { excludeKeys: params.excludeTagKeys },
      );
    }

    qb.orderBy('exercise.score_total', 'ASC').addOrderBy('exercise.name', 'ASC');

    const exercises = await qb.getMany();
    return exercises.map((e) => this.enrichExercise(e, companyId));
  }
}
