import { Column, CreateDateColumn, DeleteDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Company } from './company.entity';
import { Sale } from './sale.entity';

@Entity('product')
export class Product {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ length: 100 })
  name: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  priceCash: number; // Precio en efectivo

  @ApiProperty()
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  priceTransfer: number; // Precio por transferencia

  @ApiProperty()
  @Column({ type: 'int', default: 0 })
  stockDeposit: number; // Stock en depósito

  @ApiProperty()
  @Column({ type: 'int', default: 0 })
  stockFridge: number; // Stock en heladera

  @ApiProperty()
  @Column({ type: 'int', default: 0 })
  stockCounter: number; // Stock en mostrador

  @ApiProperty()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty()
  @ManyToOne(() => Company, company => company.products, { nullable: false })
  company: Company;

  @ApiProperty()
  @Column()
  companyId: string;

  @ApiProperty()
  @OneToMany(() => Sale, sale => sale.product)
  sales: Sale[];

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
