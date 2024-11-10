import { IsString, IsArray, IsInt, IsDateString, Min, Max, ArrayNotEmpty } from 'class-validator';

export class CreateTimeSlotsDto {
  @IsString()
  companyId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek: number[]; // Ejemplo: [1, 2, 3, 4, 5] (Lunes a Viernes)

  @IsString()
  startTime: string; // Ejemplo: "06:00"

  @IsString()
  endTime: string; // Ejemplo: "21:00"

  @IsInt()
  @Min(1)
  capacity: number; // Ejemplo: 10

  @IsDateString()
  startDate: Date; // Ejemplo: "2024-01-01"

  @IsDateString()
  endDate: Date; // Ejemplo: "2024-01-31"
}
