import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { ProductBranchStock } from '../../entities/product-branch-stock.entity';
import { Branch } from '../../entities/branch.entity';
import { Sale, PaymentMethod, PaymentStatus, StockLocation } from '../../entities/sale.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { TransferStockDto, StockSource, StockDestination } from './dto/transfer-stock.dto';
import { UserRole } from '../../common/enums/enums';

const STAFF_ROLES = [UserRole.STP_ADMIN, UserRole.DIRECTOR, UserRole.SECRETARIA];

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(ProductBranchStock)
    private readonly branchStockRepository: Repository<ProductBranchStock>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  private async ensureBranchStock(productId: string, branchId: string): Promise<ProductBranchStock> {
    let row = await this.branchStockRepository.findOne({ where: { productId, branchId } });
    if (!row) {
      row = await this.branchStockRepository.save(
        this.branchStockRepository.create({
          productId,
          branchId,
          stockDeposit: 0,
          stockFridge: 0,
          stockCounter: 0,
        }),
      );
    }
    return row;
  }

  private applyStockRow(product: Product, row: ProductBranchStock): Product {
    product.stockDeposit = row.stockDeposit;
    product.stockFridge = row.stockFridge;
    product.stockCounter = row.stockCounter;
    return product;
  }

  private async ensureUserBelongsToCompany(userId: string, companyId: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user || !STAFF_ROLES.includes(user.role)) {
        throw new ForbiddenException('No tienes permiso para gestionar productos de este centro');
      }
      const company = await this.companyRepository.findOne({
        where: { id: companyId },
        relations: ['users'],
      });
      if (!company) {
        throw new NotFoundException('Centro no encontrado');
      }
      const belongs = company.users?.some((u) => u.id === userId);
      if (!belongs) {
        throw new ForbiddenException('No perteneces a este centro');
      }
    } catch (error) {
      // Re-lanzar excepciones de negocio (ForbiddenException, NotFoundException)
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      // Para errores de base de datos, lanzar un error más descriptivo
      console.error('Error in ensureUserBelongsToCompany:', error);
      throw new BadRequestException('Error al validar permisos. Verifica la conexión a la base de datos.');
    }
  }

  // === PRODUCTOS ===

  async createProduct(companyId: string, createProductDto: CreateProductDto, userId: string): Promise<Product> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const product = this.productRepository.create({
      ...createProductDto,
      company: { id: companyId } as Company,
      companyId,
      stockDeposit: createProductDto.stockDeposit ?? 0,
      stockFridge: createProductDto.stockFridge ?? 0,
      stockCounter: createProductDto.stockCounter ?? 0,
      isActive: createProductDto.isActive ?? true,
    });

    const saved = await this.productRepository.save(product);
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (company?.multiBranchEnabled) {
      const branches = await this.branchRepository.find({ where: { companyId, isActive: true } });
      for (const branch of branches) {
        await this.branchStockRepository.save(
          this.branchStockRepository.create({
            productId: saved.id,
            branchId: branch.id,
            stockDeposit: 0,
            stockFridge: 0,
            stockCounter: 0,
          }),
        );
      }
    }
    return saved;
  }

  async getProducts(companyId: string, userId: string, branchId?: string): Promise<Product[]> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const products = await this.productRepository.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
    if (!branchId || products.length === 0) return products;
    const rows = await this.branchStockRepository.find({
      where: { branchId, productId: In(products.map((product) => product.id)) },
    });
    const byProduct = new Map(rows.map((row) => [row.productId, row]));
    return products.map((product) => {
      const row = byProduct.get(product.id);
      return row ? this.applyStockRow(product, row) : product;
    });
  }

  async getProductById(productId: string, companyId: string, userId: string): Promise<Product> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const product = await this.productRepository.findOne({
      where: { id: productId, companyId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async updateProduct(
    productId: string,
    companyId: string,
    updateProductDto: UpdateProductDto,
    userId: string,
  ): Promise<Product> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const product = await this.getProductById(productId, companyId, userId);
    Object.assign(product, updateProductDto);

    return await this.productRepository.save(product);
  }

  async deleteProduct(productId: string, companyId: string, userId: string): Promise<void> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const product = await this.getProductById(productId, companyId, userId);
    await this.productRepository.softDelete(product.id);
  }

  async updateStock(
    productId: string,
    companyId: string,
    updateStockDto: UpdateStockDto,
    userId: string,
  ): Promise<Product> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const product = await this.getProductById(productId, companyId, userId);
    if (updateStockDto.branchId) {
      const row = await this.ensureBranchStock(productId, updateStockDto.branchId);
      if (updateStockDto.stockDeposit !== undefined) row.stockDeposit = updateStockDto.stockDeposit;
      if (updateStockDto.stockFridge !== undefined) row.stockFridge = updateStockDto.stockFridge;
      if (updateStockDto.stockCounter !== undefined) row.stockCounter = updateStockDto.stockCounter;
      await this.branchStockRepository.save(row);
      return this.applyStockRow(product, row);
    }

    if (updateStockDto.stockDeposit !== undefined) {
      product.stockDeposit = updateStockDto.stockDeposit;
    }
    if (updateStockDto.stockFridge !== undefined) {
      product.stockFridge = updateStockDto.stockFridge;
    }
    if (updateStockDto.stockCounter !== undefined) {
      product.stockCounter = updateStockDto.stockCounter;
    }

    return await this.productRepository.save(product);
  }

  async transferStock(
    productId: string,
    companyId: string,
    transferStockDto: TransferStockDto,
    userId: string,
  ): Promise<Product> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const product = await this.getProductById(productId, companyId, userId);
    const { from, to, quantity } = transferStockDto;
    if (transferStockDto.branchId) {
      const row = await this.ensureBranchStock(productId, transferStockDto.branchId);
      this.applyStockRow(product, row);
    }

    // Validar que no se transfiera al mismo lugar
    if (from.toString() === to.toString()) {
      throw new BadRequestException('No puedes transferir stock al mismo lugar');
    }

    // Obtener stock actual según origen
    const stockMap = {
      [StockSource.DEPOSIT]: product.stockDeposit,
      [StockSource.FRIDGE]: product.stockFridge,
      [StockSource.COUNTER]: product.stockCounter,
    };

    const currentStock = stockMap[from];
    if (currentStock < quantity) {
      throw new BadRequestException(`Stock insuficiente en ${from}. Disponible: ${currentStock}`);
    }

    // Restar del origen
    if (from === StockSource.DEPOSIT) {
      product.stockDeposit -= quantity;
    } else if (from === StockSource.FRIDGE) {
      product.stockFridge -= quantity;
    } else if (from === StockSource.COUNTER) {
      product.stockCounter -= quantity;
    }

    // Sumar al destino
    if (to === StockDestination.DEPOSIT) {
      product.stockDeposit += quantity;
    } else if (to === StockDestination.FRIDGE) {
      product.stockFridge += quantity;
    } else if (to === StockDestination.COUNTER) {
      product.stockCounter += quantity;
    }

    if (transferStockDto.branchId) {
      const row = await this.ensureBranchStock(productId, transferStockDto.branchId);
      row.stockDeposit = product.stockDeposit;
      row.stockFridge = product.stockFridge;
      row.stockCounter = product.stockCounter;
      await this.branchStockRepository.save(row);
      return product;
    }

    return await this.productRepository.save(product);
  }

  // === VENTAS ===

  async createSale(companyId: string, createSaleDto: CreateSaleDto, userId: string): Promise<Sale> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const product = await this.getProductById(createSaleDto.productId, companyId, userId);
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (company?.multiBranchEnabled && !createSaleDto.branchId) {
      throw new BadRequestException('Elegí la sede de la venta');
    }
    if (createSaleDto.branchId) {
      const row = await this.ensureBranchStock(product.id, createSaleDto.branchId);
      this.applyStockRow(product, row);
    }
    const athlete = createSaleDto.athleteId
      ? await this.userRepository.findOne({ where: { id: createSaleDto.athleteId } })
      : null;

    if (createSaleDto.athleteId && (!athlete || athlete.role !== UserRole.ATHLETE)) {
      throw new BadRequestException('El usuario especificado no es un atleta');
    }

    // Validar stock disponible según ubicación
    const stockMap = {
      [StockLocation.FRIDGE]: product.stockFridge,
      [StockLocation.COUNTER]: product.stockCounter,
    };

    const availableStock = stockMap[createSaleDto.stockLocation];
    if (availableStock < createSaleDto.quantity) {
      throw new BadRequestException(
        `Stock insuficiente en ${createSaleDto.stockLocation}. Disponible: ${availableStock}`,
      );
    }

    // Obtener precio según método de pago
    const unitPrice =
      createSaleDto.paymentMethod === PaymentMethod.CASH ? product.priceCash : product.priceTransfer;
    const totalPrice = unitPrice * createSaleDto.quantity;

    // Crear venta
    const sale = this.saleRepository.create({
      product: { id: product.id } as Product,
      productId: product.id,
      ...(athlete ? { athlete: { id: athlete.id } as User, athleteId: athlete.id } : { athlete: null, athleteId: null }),
      company: { id: companyId } as Company,
      companyId,
      branchId: createSaleDto.branchId ?? null,
      quantity: createSaleDto.quantity,
      paymentMethod: createSaleDto.paymentMethod,
      unitPrice,
      totalPrice,
      stockLocation: createSaleDto.stockLocation,
      paymentStatus: createSaleDto.paymentStatus ?? PaymentStatus.PAID,
      notes: createSaleDto.notes,
    });

    const savedSale = await this.saleRepository.save(sale);

    if (createSaleDto.stockLocation === StockLocation.FRIDGE) {
      product.stockFridge -= createSaleDto.quantity;
    } else {
      product.stockCounter -= createSaleDto.quantity;
    }
    if (createSaleDto.branchId) {
      const row = await this.ensureBranchStock(product.id, createSaleDto.branchId);
      row.stockFridge = product.stockFridge;
      row.stockCounter = product.stockCounter;
      row.stockDeposit = product.stockDeposit;
      await this.branchStockRepository.save(row);
    } else {
      await this.productRepository.save(product);
    }

    return savedSale;
  }

  async updateSale(companyId: string, saleId: string, dto: UpdateSaleDto, userId: string): Promise<Sale> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const sale = await this.saleRepository.findOne({
      where: { id: saleId, companyId },
      relations: ['product'],
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    const product = sale.product;

    // Ajuste de stock si cambia cantidad y/o ubicación
    const oldQty = sale.quantity;
    const oldLocation = sale.stockLocation;
    const newQty = dto.quantity ?? oldQty;
    const newLocation = dto.stockLocation ?? oldLocation;

    if (newQty !== oldQty || newLocation !== oldLocation) {
      // Restaurar stock viejo
      if (oldLocation === StockLocation.FRIDGE) {
        product.stockFridge += oldQty;
      } else {
        product.stockCounter += oldQty;
      }
      // Validar stock disponible para nueva ubicación
      const available = newLocation === StockLocation.FRIDGE ? product.stockFridge : product.stockCounter;
      if (available < newQty) {
        throw new BadRequestException(
          `Stock insuficiente en ${newLocation}. Disponible: ${available}`,
        );
      }
      // Descontar nuevo stock
      if (newLocation === StockLocation.FRIDGE) {
        product.stockFridge -= newQty;
      } else {
        product.stockCounter -= newQty;
      }
      await this.productRepository.save(product);
    }

    // Actualizar atleta
    if (dto.athleteId !== undefined) {
      if (dto.athleteId) {
        const athlete = await this.userRepository.findOne({ where: { id: dto.athleteId } });
        if (!athlete || athlete.role !== UserRole.ATHLETE) {
          throw new BadRequestException('El usuario especificado no es un atleta');
        }
        sale.athlete = athlete;
        sale.athleteId = athlete.id;
      } else {
        sale.athlete = null;
        sale.athleteId = null;
      }
    }

    // Recalcular precio si cambia método de pago o cantidad
    const effectivePaymentMethod = dto.paymentMethod ?? sale.paymentMethod;
    const unitPrice =
      effectivePaymentMethod === PaymentMethod.CASH ? product.priceCash : product.priceTransfer;

    sale.quantity = newQty;
    sale.stockLocation = newLocation;
    sale.paymentMethod = effectivePaymentMethod;
    sale.unitPrice = unitPrice;
    sale.totalPrice = unitPrice * newQty;
    if (dto.notes !== undefined) sale.notes = dto.notes;
    if (dto.paymentStatus !== undefined) sale.paymentStatus = dto.paymentStatus;

    return await this.saleRepository.save(sale);
  }

  async deleteSale(companyId: string, saleId: string, userId: string): Promise<void> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const sale = await this.saleRepository.findOne({
      where: { id: saleId, companyId },
      relations: ['product'],
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    // Restaurar stock
    const product = sale.product;
    if (sale.stockLocation === StockLocation.FRIDGE) {
      product.stockFridge += sale.quantity;
    } else {
      product.stockCounter += sale.quantity;
    }
    await this.productRepository.save(product);
    await this.saleRepository.remove(sale);
  }

  async getSales(
    companyId: string,
    userId: string,
    startDate?: Date,
    endDate?: Date,
    branchId?: string,
  ): Promise<Sale[]> {
    await this.ensureUserBelongsToCompany(userId, companyId);

    try {
      const query = this.saleRepository
        .createQueryBuilder('sale')
        .leftJoinAndSelect('sale.product', 'product')
        .leftJoinAndSelect('sale.athlete', 'athlete')
        .where('sale.companyId = :companyId', { companyId })
        .orderBy('sale.createdAt', 'DESC');

      if (branchId) {
        query.andWhere('sale.branchId = :branchId', { branchId });
      }

      if (startDate) {
        query.andWhere('sale.createdAt >= :startDate', { startDate });
      }
      if (endDate) {
        query.andWhere('sale.createdAt <= :endDate', { endDate });
      }

      const sales = await query.getMany();
      return sales || [];
    } catch (error) {
      // Si hay un error (por ejemplo, tabla no existe aún), devolver array vacío
      console.error('Error fetching sales:', error);
      return [];
    }
  }

  async getSalesStatistics(companyId: string, userId: string, startDate?: Date, endDate?: Date) {
    await this.ensureUserBelongsToCompany(userId, companyId);

    const sales = await this.getSales(companyId, userId, startDate, endDate);

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0);
    const cashRevenue = sales
      .filter((s) => s.paymentMethod === PaymentMethod.CASH)
      .reduce((sum, sale) => sum + Number(sale.totalPrice), 0);
    const transferRevenue = sales
      .filter((s) => s.paymentMethod === PaymentMethod.TRANSFER)
      .reduce((sum, sale) => sum + Number(sale.totalPrice), 0);
    const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);

    // Ventas por producto
    const salesByProduct = sales.reduce((acc, sale) => {
      const productId = sale.productId;
      if (!acc[productId]) {
        acc[productId] = {
          productId,
          productName: sale.product?.name || 'N/A',
          quantity: 0,
          revenue: 0,
        };
      }
      acc[productId].quantity += sale.quantity;
      acc[productId].revenue += Number(sale.totalPrice);
      return acc;
    }, {} as Record<string, { productId: string; productName: string; quantity: number; revenue: number }>);

    return {
      totalSales,
      totalRevenue,
      cashRevenue,
      transferRevenue,
      totalQuantity,
      salesByProduct: Object.values(salesByProduct),
    };
  }
}
