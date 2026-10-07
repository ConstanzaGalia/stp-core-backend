import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './branch.entity';
import { Product } from './product.entity';

@Entity('product_branch_stock')
@Unique(['productId', 'branchId'])
export class ProductBranchStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'stock_deposit', type: 'int', default: 0 })
  stockDeposit: number;

  @Column({ name: 'stock_fridge', type: 'int', default: 0 })
  stockFridge: number;

  @Column({ name: 'stock_counter', type: 'int', default: 0 })
  stockCounter: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
