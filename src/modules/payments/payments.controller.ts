import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CompletePaymentDto } from './dto/complete-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { CreateSuspensionDto } from './dto/create-suspension.dto';
import { UpdateSuspensionDto } from './dto/update-suspension.dto';

@Controller('payments')
@UseGuards(AuthGuard('jwt'))
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ===== PLANES DE PAGO =====
  @Post('plans/:companyId')
  async createPaymentPlan(
    @Param('companyId') companyId: string,
    @Body() createPaymentPlanDto: CreatePaymentPlanDto
  ) {
    return await this.paymentsService.createPaymentPlan(companyId, createPaymentPlanDto);
  }

  @Get('plans/:companyId')
  async getPaymentPlans(@Param('companyId') companyId: string) {
    return await this.paymentsService.getPaymentPlans(companyId);
  }

  @Put('plans/:id')
  async updatePaymentPlan(
    @Param('id') id: string,
    @Body() updateData: Partial<CreatePaymentPlanDto>
  ) {
    return await this.paymentsService.updatePaymentPlan(id, updateData);
  }

  @Delete('plans/:id')
  async deletePaymentPlan(@Param('id') id: string) {
    await this.paymentsService.deletePaymentPlan(id);
    return { message: 'Payment plan deleted successfully' };
  }

  // ===== SUSCRIPCIONES =====
  @Post('subscriptions/:companyId')
  async createSubscription(
    @Param('companyId') companyId: string,
    @Body() createSubscriptionDto: CreateSubscriptionDto
  ) {
    return await this.paymentsService.createSubscription(companyId, createSubscriptionDto);
  }

  @Get('subscriptions/:companyId')
  async getSubscriptions(
    @Param('companyId') companyId: string,
    @Query('status') status?: string
  ) {
    return await this.paymentsService.getSubscriptions(companyId, status as any);
  }

  @Get('subscriptions/user/:userId')
  async getUserSubscriptions(@Param('userId') userId: string) {
    return await this.paymentsService.getUserSubscriptions(userId);
  }

  @Get('student/:userId/company/:companyId/plan-payments')
  async getStudentPlanAndPayments(
    @Param('userId') userId: string,
    @Param('companyId') companyId: string
  ) {
    return await this.paymentsService.getStudentPlanAndPayments(userId, companyId);
  }

  // ===== GESTIÓN DE CLASES =====
  @Get('subscriptions/:subscriptionId/class-status')
  async getClassStatus(@Param('subscriptionId') subscriptionId: string) {
    return await this.paymentsService.getClassStatus(subscriptionId);
  }

  @Post('subscriptions/:subscriptionId/class-usage')
  async registerClassUsage(
    @Param('subscriptionId') subscriptionId: string,
    @Body() usageData: {
      type: string;
      usageDate: string;
      notes?: string;
    }
  ) {
    return await this.paymentsService.registerClassUsage(subscriptionId, {
      ...usageData,
      type: usageData.type as any,
      usageDate: new Date(usageData.usageDate)
    });
  }

  @Post('subscriptions/:subscriptionId/can-book-class')
  async canUserBookClass(@Param('subscriptionId') subscriptionId: string) {
    const canBook = await this.paymentsService.canUserBookClass(subscriptionId);
    return { canBookClass: canBook };
  }

  // ===== PROCESAMIENTO DE PAGOS =====
  @Post('complete')
  async completePayment(@Body() completePaymentDto: CompletePaymentDto) {
    return await this.paymentsService.completePayment(completePaymentDto);
  }

  // ===== RENOVACIÓN DEL PERÍODO =====
  @Post('subscriptions/:subscriptionId/renew')
  async renewPeriodSubscription(@Param('subscriptionId') subscriptionId: string) {
    return await this.paymentsService.renewPeriodSubscription(subscriptionId);
  }

  // ===== REPORTES =====
  @Get('report/:companyId/period')
  async getPeriodReport(
    @Param('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return await this.paymentsService.getPeriodReport(companyId, startDate, endDate);
  }

  // ===== UTILIDADES =====
  @Get('month-info/:year/:month')
  async getMonthInfo(
    @Param('year') year: number,
    @Param('month') month: number
  ) {
    const weeksInMonth = this.paymentsService['calculateWeeksInMonth'](year, month - 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    return {
      year,
      month,
      weeksInMonth,
      daysInMonth,
      monthName: new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long' })
    };
  }

  @Post('calculate-late-fees')
  async calculateLateFees() {
    await this.paymentsService.calculateLateFees();
    return { message: 'Late fees calculated successfully' };
  }

  // ===== GESTIÓN DE ALUMNOS Y PAGOS =====
  @Get('students/:companyId')
  async getStudentsWithPayments(@Param('companyId') companyId: string) {
    return await this.paymentsService.getStudentsWithPayments(companyId);
  }

  // ===== GESTIÓN DE PAGOS INDIVIDUALES =====
  @Put('payment/:paymentId')
  async updatePayment(
    @Param('paymentId') paymentId: string,
    @Body() updatePaymentDto: UpdatePaymentDto
  ) {
    return await this.paymentsService.updatePayment(paymentId, updatePaymentDto);
  }

  @Delete('payment/:paymentId')
  async deletePayment(@Param('paymentId') paymentId: string) {
    return await this.paymentsService.deletePayment(paymentId);
  }

  // ===== GESTIÓN DE SUSPENSIONES TEMPORALES =====
  @Post('suspensions')
  async createSuspension(@Body() createSuspensionDto: CreateSuspensionDto) {
    return await this.paymentsService.createSuspension(createSuspensionDto);
  }

  @Get('suspensions/user/:userId/company/:companyId')
  async getSuspensions(
    @Param('userId') userId: string,
    @Param('companyId') companyId: string
  ) {
    return await this.paymentsService.getSuspensions(userId, companyId);
  }

  @Put('suspensions/:suspensionId')
  async updateSuspension(
    @Param('suspensionId') suspensionId: string,
    @Body() updateSuspensionDto: UpdateSuspensionDto
  ) {
    return await this.paymentsService.updateSuspension(suspensionId, updateSuspensionDto);
  }

  @Delete('suspensions/:suspensionId')
  async deleteSuspension(@Param('suspensionId') suspensionId: string) {
    return await this.paymentsService.deleteSuspension(suspensionId);
  }
}
