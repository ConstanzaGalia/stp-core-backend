import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UpdateFixedExpenseChecklistDto {
  @IsUUID()
  templateId: string;

  @IsInt()
  @Min(1970)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsIn(['pending', 'paid', 'na', 'no'])
  status: 'pending' | 'paid' | 'na' | 'no';

  @IsOptional()
  @IsString()
  note?: string;
}
