import { Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { BaseRepository } from 'src/repositories/base.repository';
import { Repository } from 'typeorm';


export function createBaseRepositoryProvider<T>(entity: EntityClassOrSchema, entityName: string): Provider {
  return {
    provide: `${entityName}BaseRepository`,
    useFactory: (repository: Repository<T>) => new BaseRepository<T>(repository),
    inject: [getRepositoryToken(entity)],
  };
}
