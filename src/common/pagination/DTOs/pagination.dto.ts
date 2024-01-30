export class PaginationDto {
  limit: number;

  offset: number;

  nextPage?: string;

  total: number;

  nextId?: string;

  totalWithoutFilters?: number;
}
