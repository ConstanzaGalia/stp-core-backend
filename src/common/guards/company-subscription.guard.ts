import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/entities/company.entity';
import { UserRole } from 'src/common/enums/enums';
import { SKIP_COMPANY_SUBSCRIPTION_CHECK } from '../decorators/skip-company-subscription-check.decorator';

@Injectable()
export class CompanySubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_COMPANY_SUBSCRIPTION_CHECK,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const path: string = request.route?.path ?? request.url ?? '';

    if (!user) {
      return true;
    }

    if (user.role === UserRole.STP_ADMIN) {
      return true;
    }

    if (
      path.includes('/auth') ||
      path.includes('/health') ||
      path === '/company' && request.method === 'POST' ||
      path.includes('/company/admin')
    ) {
      return true;
    }

    const companyId = this.extractCompanyId(request);
    if (!companyId) {
      return true;
    }

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'subscriptionActive', 'isDelete'],
    });

    if (!company) {
      return true;
    }

    if (company.subscriptionActive === false) {
      throw new ForbiddenException({
        code: 'COMPANY_SUBSCRIPTION_INACTIVE',
        message: 'El centro no tiene la plataforma activa. Contactá a STP para activar tu suscripción.',
      });
    }

    return true;
  }

  private extractCompanyId(request: {
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  }): string | undefined {
    const params = request.params ?? {};
    const body = request.body ?? {};
    const query = request.query ?? {};

    if (params.companyId) return params.companyId;
    if (typeof body.companyId === 'string') return body.companyId;
    if (query.companyId) return query.companyId;

    if (params.id && /^[0-9a-f-]{36}$/i.test(params.id)) {
      return params.id;
    }

    return undefined;
  }
}
