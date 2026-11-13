import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ReconcileRecurringReservationsDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  /** Si lo omite el atleta autenticado; el staff puede indicar el del atleta. */
  @IsOptional()
  @IsUUID()
  userId?: string;
}
