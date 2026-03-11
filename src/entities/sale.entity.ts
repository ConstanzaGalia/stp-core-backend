import { Column, CreateDateColumn, DeleteDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Product } from './product.entity';
import { User } from './user.entity';
import { Company } from './company.entity';

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER'
}

export enum StockLocation {
  FRIDGE = 'FRIDGE',
  COUNTER = 'COUNTER'
}

@Entity('sale')
export class Sale {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @ManyToOne(() => Product, product => product.sales, { nullable: false })
  product: Product;

  @ApiProperty()
  @Column()
  productId: string;

  @ApiProperty()
  @ManyToOne(() => User, { nullable: true })
  athlete: User | null;

  @ApiProperty()
  @Column({ nullable: true })
  athleteId: string | null;

  @ApiProperty()
  @ManyToOne(() => Company, { nullable: false })
  company: Company;

  @ApiProperty()
  @Column()
  companyId: string;

  @ApiProperty()
  @Column({ type: 'int' })
  quantity: number;

  @ApiProperty()
  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number; // Precio unitario al momento de la venta

  @ApiProperty()
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number; // Precio total (quantity * unitPrice)

  @ApiProperty()
  @Column({ type: 'enum', enum: StockLocation })
  stockLocation: StockLocation; // De dónde se vendió (heladera o mostrador)

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiProperty()
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
