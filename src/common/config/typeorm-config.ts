import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import entities from 'src/entities/index.entities';

export const TYPEORM_CONFIG: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: entities,
  synchronize: false,
  extra: {
    connectionLimit: 15,
  },
};