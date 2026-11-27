import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/common/enums/enums';
import { CompanySubscriptionGuard } from './company-subscription.guard';

const COMPANY_ID = '7623d786-23a5-447b-b970-bb58ee2a70ac';

function buildGuard(company: Record<string, unknown> | null) {
  const repo = { findOne: jest.fn().mockResolvedValue(company) };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
  const guard = new CompanySubscriptionGuard(reflector, repo as never);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 'u1', role: UserRole.DIRECTOR },
        route: { path: '/company/:companyId/athletes' },
        method: 'GET',
        params: { companyId: COMPANY_ID },
      }),
    }),
  } as unknown as ExecutionContext;
  return { guard, context, repo };
}

describe('CompanySubscriptionGuard (prueba gratuita)', () => {
  it('bloquea con COMPANY_SUBSCRIPTION_INACTIVE si el centro está inactivo', async () => {
    const { guard, context } = buildGuard({ id: COMPANY_ID, subscriptionActive: false });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'COMPANY_SUBSCRIPTION_INACTIVE' },
    });
  });

  it('bloquea con COMPANY_TRIAL_EXPIRED si la prueba ya venció', async () => {
    const { guard, context } = buildGuard({
      id: COMPANY_ID,
      subscriptionActive: true,
      trialEndsAt: new Date(Date.now() - 60_000),
    });
    const attempt = guard.canActivate(context);
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toMatchObject({ response: { code: 'COMPANY_TRIAL_EXPIRED' } });
  });

  it('deja pasar con prueba vigente, sin prueba o ya pagado (trialEndsAt null)', async () => {
    for (const trialEndsAt of [new Date(Date.now() + 86_400_000), null]) {
      const { guard, context } = buildGuard({
        id: COMPANY_ID,
        subscriptionActive: true,
        trialEndsAt,
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
  });

  it('pide trialEndsAt en el select', async () => {
    const { guard, context, repo } = buildGuard({ id: COMPANY_ID, subscriptionActive: true });
    await guard.canActivate(context);
    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.arrayContaining(['trialEndsAt']) }),
    );
  });
});
