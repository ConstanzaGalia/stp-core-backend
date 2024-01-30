import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AuthGuard } from '@nestjs/passport';
import { PaginationQueryDto } from 'src/common/pagination/DTOs/pagination-query.dto';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  public async create(@Body() createCompanyDto: CreateCompanyDto) {
    return await this.companyService.create(createCompanyDto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  public async findAll(
    @Query() pagination: PaginationQueryDto,
    @Req() request,
  ): Promise<PaginatedListDto<CreateCompanyDto>> {
    return await this.companyService.findAll(
      pagination.offset,
      pagination.limit,
      request.url,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  public async findOne(@Param('id') id: string): Promise<CreateCompanyDto> {
    return await this.companyService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  public async update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    return await this.companyService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  public async remove(@Param('id') id: string): Promise<string> {
    return await this.companyService.remove(id);
  }
}
