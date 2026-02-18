import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { validate as uuidValidate } from 'uuid';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // === PRODUCTOS ===

  @Post('company/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async createProduct(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @Body() createProductDto: CreateProductDto,
    @GetUser() user: User,
  ) {
    return await this.productsService.createProduct(companyId, createProductDto, user.id);
  }

  @Get('company/:companyId')
  @UseGuards(AuthGuard('jwt'))
  async getProducts(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @GetUser() user: User,
  ) {
    return await this.productsService.getProducts(companyId, user.id);
  }

  // IMPORTANTE: Rutas de ventas DEBEN ir antes de company/:companyId/:productId
  // para que "sales" no se interprete como productId
  @Get('company/:companyId/sales')
  @UseGuards(AuthGuard('jwt'))
  async getSales(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!uuidValidate(companyId)) {
      throw new BadRequestException('Invalid UUID format');
    }
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.productsService.getSales(companyId, user.id, start, end);
  }

  @Get('company/:companyId/sales/statistics')
  @UseGuards(AuthGuard('jwt'))
  async getSalesStatistics(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!uuidValidate(companyId)) {
      throw new BadRequestException('Invalid UUID format');
    }
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return await this.productsService.getSalesStatistics(companyId, user.id, start, end);
  }

  @Post('company/:companyId/sales')
  @UseGuards(AuthGuard('jwt'))
  async createSale(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @Body() createSaleDto: CreateSaleDto,
    @GetUser() user: User,
  ) {
    return await this.productsService.createSale(companyId, createSaleDto, user.id);
  }

  @Get('company/:companyId/:productId')
  @UseGuards(AuthGuard('jwt'))
  async getProductById(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @GetUser() user: User,
  ) {
    return await this.productsService.getProductById(productId, companyId, user.id);
  }

  @Put('company/:companyId/:productId')
  @UseGuards(AuthGuard('jwt'))
  async updateProduct(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() updateProductDto: UpdateProductDto,
    @GetUser() user: User,
  ) {
    return await this.productsService.updateProduct(productId, companyId, updateProductDto, user.id);
  }

  @Delete('company/:companyId/:productId')
  @UseGuards(AuthGuard('jwt'))
  async deleteProduct(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @GetUser() user: User,
  ) {
    await this.productsService.deleteProduct(productId, companyId, user.id);
    return { message: 'Producto eliminado correctamente' };
  }

  @Put('company/:companyId/:productId/stock')
  @UseGuards(AuthGuard('jwt'))
  async updateStock(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() updateStockDto: UpdateStockDto,
    @GetUser() user: User,
  ) {
    return await this.productsService.updateStock(productId, companyId, updateStockDto, user.id);
  }

  @Post('company/:companyId/:productId/transfer-stock')
  @UseGuards(AuthGuard('jwt'))
  async transferStock(
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() transferStockDto: TransferStockDto,
    @GetUser() user: User,
  ) {
    return await this.productsService.transferStock(productId, companyId, transferStockDto, user.id);
  }
}
