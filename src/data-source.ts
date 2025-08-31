import 'dotenv/config'
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Company } from './entities/company.entity';
import { Category } from './entities/category.entity';
import { Exercise } from './entities/excercise.entity';
import { Payment } from './entities/payment.entity';
import { Reservation } from './entities/reservation.entity';
import { Plan } from './entities/plan.entity';
import { Slot } from './entities/slot.entity';
import { TimeSlot } from './entities/timeSlot.entity';
import { UserPlan } from './entities/userPlan.entity';
import { Tag } from './entities/tag.entity';
import { TrainingPlan } from './entities/traininPlan.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Company, Category, Exercise, Payment, Reservation, Plan, Slot, TimeSlot, UserPlan, Reservation, Tag, TrainingPlan],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  ssl: {
    rejectUnauthorized: false,
  },
});
