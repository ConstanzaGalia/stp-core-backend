import 'dotenv/config';
import { DataSource } from 'typeorm';
import { TYPEORM_ENTITIES } from './typeorm-entities';

const sslEnabled = String(process.env.DB_SSL ?? 'true').toLowerCase() !== 'false';
const databaseUrl = process.env.DATABASE_URL?.trim();

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }),
  entities: TYPEORM_ENTITIES,
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});
