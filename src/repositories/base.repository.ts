import { Repository, DeepPartial, FindManyOptions, FindOneOptions } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

@Injectable()
export class BaseRepository<T> {
  constructor(
    private readonly repository: Repository<T>,
  ) {}

  async create(entity: DeepPartial<T>): Promise<T> {
    return this.repository.save(entity);
  }

  async findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find(options);
  }

  async findOne(options?: FindOneOptions<T>): Promise<T> {
    return this.repository.findOne(options);
  }

  async update(id: string, entity: QueryDeepPartialEntity<T>): Promise<void> {
    await this.repository.update(id, entity);
  }

  async remove(id: string): Promise<void> {
    await this.repository.softDelete(id); // Soft delete the entity
  }
}
