import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { Pagination } from 'src/common/pagination/pagination';
import { Exercise } from 'src/entities/excercise.entity';
import { Category } from 'src/entities/category.entity';
import { MovementPattern } from 'src/entities/movement-pattern.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { Tag } from 'src/entities/tag.entity';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';

@Injectable()
export class ExerciseService {
  private readonly logger = new Logger(ExerciseService.name);

  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,
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

  private readonly EXERCISE_RELATIONS = [
    'primaryCategory',
    'tags',
    'movementPattern',
    'safetyTags',
  ];

  public async create(dto: CreateExerciseDto): Promise<Exercise> {
    try {
      const exercise = this.exerciseRepository.create({
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
        exercise.primaryCategory = await this.categoryRepository.findOneBy({ id: dto.primaryCategoryId });
      }
      if (dto.movementPatternId) {
        exercise.movementPattern = await this.movementPatternRepository.findOneBy({ id: dto.movementPatternId });
      }
      if (dto.safetyTagIds?.length) {
        exercise.safetyTags = await this.safetyTagRepository.findBy({ id: In(dto.safetyTagIds) });
      }
      if (dto.tagIds?.length) {
        exercise.tags = await this.tagRepository.findBy({ id: In(dto.tagIds) });
      }

      return await this.exerciseRepository.save(exercise);
    } catch (error) {
      this.logger.error('Error creating exercise', error);
      throw error;
    }
  }

  public async findAll(
    offset: number,
    limit: number,
    path: string,
  ): Promise<PaginatedListDto<Exercise>> {
    const [exercises, count] = await this.exerciseRepository.findAndCount({
      take: limit,
      skip: offset,
      relations: this.EXERCISE_RELATIONS,
      order: { name: 'ASC' },
    });
    return new PaginatedListDto(
      exercises,
      this.pagination.buildPaginationDto(limit, offset, count, path),
    );
  }

  public async findOne(id: string): Promise<Exercise> {
    const exercise = await this.exerciseRepository.findOne({
      where: { id },
      relations: this.EXERCISE_RELATIONS,
    });
    if (!exercise) throw new NotFoundException(`Exercise ${id} not found`);
    return exercise;
  }

  public async update(id: string, dto: UpdateExerciseDto): Promise<Exercise> {
    try {
      const exercise = await this.findOne(id);

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
          ? await this.movementPatternRepository.findOneBy({ id: dto.movementPatternId })
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

      return await this.exerciseRepository.save(exercise);
    } catch (error) {
      this.logger.error(`Error updating exercise ${id}`, error);
      throw error;
    }
  }

  public async remove(id: string): Promise<string> {
    try {
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

  public async filter(params: {
    maxScore?: number;
    excludeTagKeys?: string[];
    patternId?: number;
    categoryId?: number;
  }): Promise<Exercise[]> {
    const qb = this.exerciseRepository
      .createQueryBuilder('exercise')
      .leftJoinAndSelect('exercise.primaryCategory', 'category')
      .leftJoinAndSelect('exercise.movementPattern', 'movementPattern')
      .leftJoinAndSelect('exercise.safetyTags', 'safetyTag')
      .leftJoinAndSelect('exercise.tags', 'tag');

    if (params.maxScore !== undefined) {
      qb.andWhere('exercise.score_total <= :maxScore', { maxScore: params.maxScore });
    }

    if (params.patternId) {
      qb.andWhere('movementPattern.id = :patternId', { patternId: params.patternId });
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

    return qb.getMany();
  }
}
