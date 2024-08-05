import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Company } from './entities/company.entity';
import { Category } from './entities/category.entity';
import { Exercise } from './entities/excercise.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Company, Category, Exercise],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
